import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyDepartment } from '../lib/notify.js'
import { nextDailySequence } from '../lib/sequence.js'
import { buildDisplayLabel, dailyScope, opaqueJobNo } from '../lib/label.js'
import { acceptanceDueAt } from '../lib/sla.js'
import { renderJobCard } from '../lib/jobcard.js'

const createSchema = z.object({
  productId: z.string().uuid(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  jobType: z.enum(['production', 'rework']).default('production'),
  pipelineTemplateId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  reworkIssue: z.string().max(500).optional(),
  reworkEntryDepartmentId: z.string().uuid().optional(),
  models: z
    .array(z.object({ modelId: z.string().uuid(), size: z.string().max(20).optional(), quantity: z.number().int().positive() }))
    .min(1),
})

const jobSummarySelect = {
  id: true,
  jobNo: true,
  displayLabel: true,
  status: true,
  priority: true,
  jobType: true,
  totalQty: true,
  startDate: true,
  createdAt: true,
  product: { select: { code: true, name: true } },
} satisfies Prisma.JobSelect

export async function jobRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── create job (Admin only — PPC submits requests Admin approves) ──────────
  app.post('/', { preHandler: requireRole('admin') }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const input = parsed.data
    const actorId = (req.user as AccessPayload).sub

    // resolve product + validate models belong to it
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      include: { models: { select: { id: true } } },
    })
    if (!product) return reply.code(404).send({ error: 'product_not_found' })
    const allowed = new Set(product.models.map((m) => m.id))
    const badModel = input.models.find((m) => !allowed.has(m.modelId))
    if (badModel) return reply.code(400).send({ error: 'model_not_in_product', modelId: badModel.modelId })

    // resolve pipeline (explicit, else product default)
    const template = input.pipelineTemplateId
      ? await prisma.pipelineTemplate.findFirst({
          where: { id: input.pipelineTemplateId, productId: product.id },
          include: { steps: { orderBy: { sequence: 'asc' } } },
        })
      : await prisma.pipelineTemplate.findFirst({
          where: { productId: product.id, isDefault: true },
          include: { steps: { orderBy: { sequence: 'asc' } } },
        })
    if (!template || template.steps.length === 0)
      return reply.code(400).send({ error: 'no_pipeline' })

    if (input.jobType === 'rework' && !input.reworkEntryDepartmentId)
      return reply.code(400).send({ error: 'rework_entry_required' })

    const totalQty = input.models.reduce((s, m) => s + m.quantity, 0)
    const now = new Date()
    const priority = input.priority
    // Read SLA config *before* the transaction — keeps the tx to pure writes so
    // it stays well under the timeout on a high-latency (Neon) connection. The
    // first step is armed with the acceptance-escalation clock inline.
    const firstStepDue = await acceptanceDueAt(now)
    const firstDeptId = template.steps[0].departmentId

    // The whole creation is one transaction: sequence, label, job, steps,
    // event, audit, first-dept notify — all-or-nothing. Retry once on the
    // (astronomically rare) opaque-jobNo collision.
    const create = () =>
      prisma.$transaction(
        async (tx) => {
          const seq = await nextDailySequence(tx, dailyScope(product.code, now))
          const displayLabel = buildDisplayLabel(product.code, priority, totalQty, now, seq)
          const jobNo = opaqueJobNo()

          const job = await tx.job.create({
            data: {
              jobNo,
              displayLabel,
              jobType: input.jobType,
              productId: product.id,
              priority,
              totalQty,
              status: 'in_production',
              pipelineTemplateId: template.id,
              source: 'admin',
              createdById: actorId,
              startDate: input.startDate ?? null,
              reworkIssue: input.reworkIssue ?? null,
              reworkEntryDepartmentId: input.reworkEntryDepartmentId ?? null,
              models: { create: input.models.map((m) => ({ modelId: m.modelId, size: m.size ?? null, quantity: m.quantity })) },
              steps: {
                create: template.steps.map((s, i) => ({
                  departmentId: s.departmentId,
                  sequence: s.sequence,
                  status: i === 0 ? 'waiting_acceptance' : 'pending',
                  slaDueAt: i === 0 ? firstStepDue : null,
                })),
              },
            },
            include: { steps: { orderBy: { sequence: 'asc' } } },
          })

          await tx.jobEvent.create({
            data: {
              jobId: job.id,
              type: 'created',
              actorId,
              body: displayLabel,
              meta: { totalQty, models: input.models.length, pipeline: template.name },
            },
          })
          await writeAudit('job', job.id, 'create', { actorId, after: { jobNo, displayLabel, status: job.status }, tx })
          await notifyDepartment(tx, firstDeptId, {
            type: 'new_job',
            jobId: job.id,
            body: `New job ${displayLabel} arriving`,
          })
          return job
        },
        { timeout: 20_000, maxWait: 5_000 },
      )

    let job
    try {
      job = await create()
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        job = await create() // jobNo collision — one retry with a fresh id
      } else {
        throw e
      }
    }

    return reply.code(201).send({
      job: { id: job.id, jobNo: job.jobNo, displayLabel: job.displayLabel, status: job.status, steps: job.steps },
    })
  })

  // ── list ───────────────────────────────────────────────────────────────────
  app.get('/', async (req) => {
    const q = z
      .object({
        status: z.string().optional(),
        take: z.coerce.number().int().min(1).max(100).default(50),
      })
      .parse(req.query)
    const jobs = await prisma.job.findMany({
      where: q.status ? { status: q.status as Prisma.JobWhereInput['status'] } : undefined,
      orderBy: { createdAt: 'desc' },
      take: q.take,
      select: jobSummarySelect,
    })
    return { jobs }
  })

  // ── a station's queue: jobs arriving at / in progress at a department ────────
  app.get('/queue', async (req, reply) => {
    const u = req.user as AccessPayload
    const q = z.object({ departmentId: z.string().uuid().optional() }).parse(req.query)
    const isAdmin = u.roles.some((r) => r.role === 'admin')
    // station = explicit (admins/superuser may query any dept) or the user's own
    let deptId = q.departmentId
    if (deptId) {
      if (!isAdmin && !u.roles.some((r) => r.departmentId === deptId)) return reply.code(403).send({ error: 'forbidden' })
    } else {
      const floor = u.roles.find((r) => ['dept_head', 'qc', 'fg_stock', 'maintenance'].includes(r.role) && r.departmentId)
      deptId = floor?.departmentId ?? undefined
    }
    if (!deptId) return { jobs: [] }

    const steps = await prisma.jobStep.findMany({
      where: {
        departmentId: deptId,
        status: { in: ['waiting_acceptance', 'in_progress'] },
        job: { status: { notIn: ['closed', 'cancelled'] } },
      },
      orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }],
      select: {
        status: true,
        slaDueAt: true,
        job: { select: jobSummarySelect },
      },
    })
    const jobs = steps.map((s) => ({ ...s.job, stepStatus: s.status, slaDueAt: s.slaDueAt }))
    return { jobs }
  })

  // ── detail (incl. live step states + timeline) ──────────────────────────────
  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        product: { select: { code: true, name: true } },
        models: { include: { model: { select: { code: true, name: true } } } },
        steps: {
          orderBy: { sequence: 'asc' },
          include: { department: { select: { code: true, name: true } } },
        },
        events: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    return { job }
  })

  // ── printable job card (QR + Code128 encode the opaque jobNo) ───────────────
  app.get('/:id/card', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        models: { include: { model: { select: { code: true, name: true } } } },
        steps: { orderBy: { sequence: 'asc' }, include: { department: { select: { name: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const html = await renderJobCard({
      jobNo: job.jobNo,
      displayLabel: job.displayLabel,
      productName: job.product.name,
      priority: job.priority,
      totalQty: job.totalQty,
      createdAt: job.createdAt,
      startDate: job.startDate,
      models: job.models.map((m) => ({ code: m.model.code, name: m.model.name, size: m.size, quantity: m.quantity })),
      steps: job.steps.map((s) => ({ sequence: s.sequence, name: s.department.name })),
    })
    return reply.type('text/html; charset=utf-8').send(html)
  })
}
