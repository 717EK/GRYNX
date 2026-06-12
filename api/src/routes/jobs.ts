import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { createJobFromInput } from '../lib/jobCreate.js'
import { renderJobCard } from '../lib/jobcard.js'
import { notifyDepartment } from '../lib/notify.js'
import { writeAudit } from '../lib/audit.js'

const createSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().max(120).optional(),
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
  name: true,
  status: true,
  priority: true,
  jobType: true,
  totalQty: true,
  startDate: true,
  createdAt: true,
  product: { select: { code: true, name: true } },
  // the station the job is actually at right now (so the list shows "Design · Awaiting"
  // etc. rather than just the coarse job status)
  steps: {
    where: { status: { in: ['waiting_acceptance', 'in_progress', 'on_hold'] } },
    orderBy: { sequence: 'asc' },
    take: 1,
    select: { status: true, department: { select: { code: true, name: true } } },
  },
} satisfies Prisma.JobSelect

export async function jobRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── create job (Admin only — PPC submits requests Admin approves) ──────────
  app.post('/', { preHandler: requireRole('admin') }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const result = await createJobFromInput(parsed.data, { actorId, source: 'admin' })
    if (!result.ok) return reply.code(result.status).send({ error: result.error })
    const job = result.job
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
    const rows = await prisma.job.findMany({
      where: q.status ? { status: q.status as Prisma.JobWhereInput['status'] } : undefined,
      orderBy: { createdAt: 'desc' },
      take: q.take,
      select: jobSummarySelect,
    })
    // surface the live station as `current` (drops the partial steps array)
    const jobs = rows.map(({ steps, ...j }) => ({ ...j, current: steps[0] ?? null }))
    return { jobs }
  })

  // ── admin asks the current station for a status update ──────────────────────
  app.post('/:id/request-update', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        displayLabel: true,
        steps: { where: { status: { in: ['waiting_acceptance', 'in_progress', 'on_hold'] } }, orderBy: { sequence: 'asc' }, take: 1, select: { departmentId: true, department: { select: { name: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const cur = job.steps[0]
    if (!cur) return reply.code(409).send({ error: 'no_active_station', detail: 'job is not on the floor' })
    await prisma.$transaction(async (tx) => {
      await tx.jobEvent.create({ data: { jobId: id, type: 'update_request', actorId, body: `Admin requested a status update from ${cur.department.name}` } })
      await notifyDepartment(tx, cur.departmentId, { type: 'update_request', jobId: id, body: `Admin requested an update on ${job.displayLabel}` })
      await writeAudit('job', id, 'request_update', { actorId, after: { dept: cur.department.name }, tx })
    })
    return { ok: true, dept: cur.department.name }
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
    const jobs = steps.map((s) => {
      const { steps: cur, ...job } = s.job
      return { ...job, current: cur[0] ?? null, stepStatus: s.status, slaDueAt: s.slaDueAt }
    })
    return { jobs }
  })

  const detailInclude = {
    product: { select: { code: true, name: true } },
    models: { include: { model: { select: { code: true, name: true } } } },
    steps: { orderBy: { sequence: 'asc' }, include: { department: { select: { code: true, name: true } } } },
    events: { orderBy: { createdAt: 'desc' }, take: 50 },
    // pipeline-v2: the production station trail (free / parallel) + parallel material needs
    stationVisits: { orderBy: { scanInAt: 'asc' }, include: { station: { select: { code: true, name: true } } } },
    materialRequests: { orderBy: { createdAt: 'desc' } },
  } satisfies Prisma.JobInclude

  // ── resolve a scanned code (jobNo OR displayLabel) → full detail ─────────────
  // Admin scans any job card to pull up its whole history (read-only lookup).
  app.get('/lookup', async (req, reply) => {
    const { code } = z.object({ code: z.string().min(3).max(60) }).parse(req.query)
    const c = code.trim().toUpperCase().replace(/^GRYNX:/, '')
    const job = await prisma.job.findFirst({
      where: { OR: [{ jobNo: c }, { displayLabel: { equals: c, mode: 'insensitive' } }] },
      include: detailInclude,
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    return { job }
  })

  // ── detail (incl. live step states + timeline) ──────────────────────────────
  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const job = await prisma.job.findUnique({ where: { id }, include: detailInclude })
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
