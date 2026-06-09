import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins, notifyUsers } from '../lib/notify.js'
import { nextDailySequence } from '../lib/sequence.js'
import { createJobFromInput } from '../lib/jobCreate.js'

const createSchema = z.object({
  productId: z.string().uuid(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  startDate: z.coerce.date().optional(),
  targetDate: z.coerce.date().optional(),
  models: z
    .array(z.object({ modelId: z.string().uuid(), size: z.string().max(20).optional(), quantity: z.number().int().positive() }))
    .min(1),
})

const requestSelect = {
  id: true,
  requestNo: true,
  priority: true,
  status: true,
  startDate: true,
  targetDate: true,
  createdAt: true,
  createdById: true,
  approvedJobId: true,
  clarificationNote: true,
  product: { select: { id: true, code: true, name: true } },
  models: { select: { quantity: true, size: true, model: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.PpcRequestSelect

export async function ppcRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── PPC raises a request ────────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const input = parsed.data
    const actorId = (req.user as AccessPayload).sub

    const product = await prisma.product.findUnique({ where: { id: input.productId }, include: { models: { select: { id: true } } } })
    if (!product) return reply.code(404).send({ error: 'product_not_found' })
    const allowed = new Set(product.models.map((m) => m.id))
    if (input.models.some((m) => !allowed.has(m.modelId))) return reply.code(400).send({ error: 'model_not_in_product' })

    const request = await prisma.$transaction(async (tx) => {
      const seq = await nextDailySequence(tx, 'ppc:counter')
      const r = await tx.ppcRequest.create({
        data: {
          requestNo: `PR-${String(seq).padStart(4, '0')}`,
          productId: product.id,
          priority: input.priority,
          startDate: input.startDate ?? null,
          targetDate: input.targetDate ?? null,
          status: 'submitted',
          createdById: actorId,
          models: { create: input.models.map((m) => ({ modelId: m.modelId, size: m.size ?? null, quantity: m.quantity })) },
        },
        select: requestSelect,
      })
      await writeAudit('ppc_request', r.id, 'create', { actorId, after: { requestNo: r.requestNo }, tx })
      await notifyAdmins(tx, { type: 'ppc_approval', body: `New PPC request ${r.requestNo} — review & approve` })
      return r
    })
    return reply.code(201).send({ request })
  })

  // ── list (default = the pending review queue) + count for the badge ─────────
  app.get('/', async (req) => {
    const q = z.object({ status: z.enum(['submitted', 'approved', 'rejected', 'clarification', 'cancelled', 'draft']).optional() }).parse(req.query)
    const requests = await prisma.ppcRequest.findMany({
      where: { status: q.status ?? 'submitted' },
      orderBy: { createdAt: 'desc' },
      select: requestSelect,
    })
    return { requests }
  })
  app.get('/count', async () => {
    const pending = await prisma.ppcRequest.count({ where: { status: 'submitted' } })
    return { pending }
  })

  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const request = await prisma.ppcRequest.findUnique({ where: { id }, select: requestSelect })
    if (!request) return reply.code(404).send({ error: 'not_found' })
    return { request }
  })

  // ── admin approves → creates the job ────────────────────────────────────────
  app.post('/:id/approve', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const r = await prisma.ppcRequest.findUnique({ where: { id }, include: { models: true } })
    if (!r) return reply.code(404).send({ error: 'not_found' })
    if (r.status === 'approved') return reply.code(409).send({ error: 'already_approved', approvedJobId: r.approvedJobId })

    const result = await createJobFromInput(
      { productId: r.productId, priority: r.priority, startDate: r.startDate, models: r.models.map((m) => ({ modelId: m.modelId, size: m.size, quantity: m.quantity })) },
      { actorId, source: 'ppc', ppcRequestId: id },
    )
    if (!result.ok) return reply.code(result.status).send({ error: result.error })
    const job = result.job
    await prisma.ppcRequest.update({ where: { id }, data: { status: 'approved', approvedJobId: job.id } })
    await writeAudit('ppc_request', id, 'approve', { actorId, after: { jobId: job.id } })
    await notifyUsers(prisma, [r.createdById], { type: 'ppc_approval', body: `Request ${r.requestNo} approved → ${job.displayLabel}`, jobId: job.id })
    return reply.code(201).send({ job: { id: job.id, jobNo: job.jobNo, displayLabel: job.displayLabel, status: job.status } })
  })

  // ── admin rejects / sends back ──────────────────────────────────────────────
  app.post('/:id/reject', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    const r = await prisma.ppcRequest.findUnique({ where: { id }, select: { createdById: true, requestNo: true } })
    if (!r) return reply.code(404).send({ error: 'not_found' })
    await prisma.ppcRequest.update({ where: { id }, data: { status: 'rejected', clarificationNote: body.note ?? null } })
    await writeAudit('ppc_request', id, 'reject', { actorId })
    await notifyUsers(prisma, [r.createdById], { type: 'ppc_approval', body: `Request ${r.requestNo} sent back${body.note ? ': ' + body.note : ''}` })
    return { ok: true }
  })
}
