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

// An edit applied to an existing request (admin proposal, or PPC resubmit).
const editSchema = createSchema

// Re-validate models belong to the product, then overwrite the request's
// header fields + lines inside the given transaction. Caller sets status.
async function applyEdit(tx: Prisma.TransactionClient, id: string, input: z.infer<typeof editSchema>) {
  const product = await tx.product.findUnique({ where: { id: input.productId }, include: { models: { select: { id: true } } } })
  if (!product) return { ok: false as const, status: 404, error: 'product_not_found' }
  const allowed = new Set(product.models.map((m) => m.id))
  if (input.models.some((m) => !allowed.has(m.modelId))) return { ok: false as const, status: 400, error: 'model_not_in_product' }
  await tx.ppcRequestModel.deleteMany({ where: { requestId: id } })
  await tx.ppcRequest.update({
    where: { id },
    data: {
      productId: input.productId,
      priority: input.priority,
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      models: { create: input.models.map((m) => ({ modelId: m.modelId, size: m.size ?? null, quantity: m.quantity })) },
    },
  })
  return { ok: true as const }
}

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
    const q = z
      .object({ status: z.enum(['submitted', 'approved', 'rejected', 'clarification', 'pending_confirm', 'cancelled', 'draft']).optional() })
      .parse(req.query)
    const requests = await prisma.ppcRequest.findMany({
      where: { status: q.status ?? 'submitted' },
      orderBy: { createdAt: 'desc' },
      select: requestSelect,
    })
    return { requests }
  })

  // ── PPC's own inbox: requests of mine still needing action ──────────────────
  // pending_confirm = admin proposed edits I must confirm; clarification = admin
  // sent it back (RC) for me to fix & resubmit. Submitted are awaiting admin.
  app.get('/mine', async (req) => {
    const actorId = (req.user as AccessPayload).sub
    const requests = await prisma.ppcRequest.findMany({
      where: { createdById: actorId, status: { in: ['pending_confirm', 'clarification', 'submitted'] } },
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
    // Only a submitted request may be approved. If admin proposed edits it is
    // pending_confirm and must come back through PPC first.
    if (r.status !== 'submitted') return reply.code(409).send({ error: 'awaiting_ppc', status: r.status })

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

  // ── admin requests changes (RC) → back to PPC with feedback ─────────────────
  app.post('/:id/request-change', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ note: z.string().min(1).max(500) }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    const r = await prisma.ppcRequest.findUnique({ where: { id }, select: { createdById: true, requestNo: true, status: true } })
    if (!r) return reply.code(404).send({ error: 'not_found' })
    if (r.status === 'approved') return reply.code(409).send({ error: 'already_approved' })
    await prisma.ppcRequest.update({ where: { id }, data: { status: 'clarification', clarificationNote: body.note } })
    await writeAudit('ppc_request', id, 'request_change', { actorId, after: { note: body.note } })
    await notifyUsers(prisma, [r.createdById], { type: 'ppc_approval', body: `Changes requested on ${r.requestNo}: ${body.note}` })
    return { ok: true }
  })

  // ── admin proposes edits → PPC must confirm before it can be approved ───────
  app.post('/:id/propose', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const parsed = editSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const r = await prisma.ppcRequest.findUnique({ where: { id }, select: { createdById: true, requestNo: true, status: true } })
    if (!r) return reply.code(404).send({ error: 'not_found' })
    if (r.status === 'approved') return reply.code(409).send({ error: 'already_approved' })

    const note = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {}).note
    const out = await prisma.$transaction(async (tx) => {
      const e = await applyEdit(tx, id, parsed.data)
      if (!e.ok) return e
      await tx.ppcRequest.update({ where: { id }, data: { status: 'pending_confirm', clarificationNote: note ?? null } })
      await writeAudit('ppc_request', id, 'propose', { actorId, after: { models: parsed.data.models.length, note }, tx })
      await notifyUsers(tx, [r.createdById], { type: 'ppc_approval', body: `Admin proposed changes to ${r.requestNo} — please confirm` })
      return { ok: true as const }
    })
    if (!out.ok) return reply.code(out.status).send({ error: out.error })
    const request = await prisma.ppcRequest.findUnique({ where: { id }, select: requestSelect })
    return { request }
  })

  // ── PPC confirms admin's proposed edits → back to admin for final approval ──
  app.post('/:id/confirm', { preHandler: requireRole('ppc', 'admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const r = await prisma.ppcRequest.findUnique({ where: { id }, select: { requestNo: true, status: true } })
    if (!r) return reply.code(404).send({ error: 'not_found' })
    if (r.status !== 'pending_confirm') return reply.code(409).send({ error: 'not_pending_confirm', status: r.status })
    await prisma.ppcRequest.update({ where: { id }, data: { status: 'submitted', clarificationNote: null } })
    await writeAudit('ppc_request', id, 'confirm', { actorId })
    await notifyAdmins(prisma, { type: 'ppc_approval', body: `${r.requestNo} confirmed by PPC — ready to approve` })
    return { ok: true }
  })

  // ── PPC resubmits after an RC (edited the request) → back to admin queue ────
  app.post('/:id/resubmit', { preHandler: requireRole('ppc', 'admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const parsed = editSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const r = await prisma.ppcRequest.findUnique({ where: { id }, select: { requestNo: true, status: true } })
    if (!r) return reply.code(404).send({ error: 'not_found' })
    if (r.status !== 'clarification') return reply.code(409).send({ error: 'not_in_clarification', status: r.status })

    const out = await prisma.$transaction(async (tx) => {
      const e = await applyEdit(tx, id, parsed.data)
      if (!e.ok) return e
      await tx.ppcRequest.update({ where: { id }, data: { status: 'submitted', clarificationNote: null } })
      await writeAudit('ppc_request', id, 'resubmit', { actorId, tx })
      await notifyAdmins(tx, { type: 'ppc_approval', body: `${r.requestNo} resubmitted by PPC — review & approve` })
      return { ok: true as const }
    })
    if (!out.ok) return reply.code(out.status).send({ error: out.error })
    const request = await prisma.ppcRequest.findUnique({ where: { id }, select: requestSelect })
    return { request }
  })
}
