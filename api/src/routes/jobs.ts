import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { createJobFromInput } from '../lib/jobCreate.js'
import { renderJobCard } from '../lib/jobcard.js'
import { renderJobRecord } from '../lib/jobrecord.js'
import { notifyDepartment, notifyAdmins } from '../lib/notify.js'
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

  // ── Design confirms a job → back to PPC (docs/12 §1a) ───────────────────────
  // Design is a double-check: most jobs are standard (just confirm), a new one gets
  // a drawing attached. Confirming routes the job BACK TO PPC (not straight to
  // production) — PPC then forwards it (and may split) to Production.
  app.post('/:id/design-release', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ note: z.string().max(500).optional(), fileUrl: z.string().max(6_000_000).optional() }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const u = req.user as AccessPayload
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        displayLabel: true, totalQty: true, status: true,
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, status: true, departmentId: true, department: { select: { code: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const design = job.steps.find((s) => s.department.code === 'DESIGN')
    const prod = job.steps.find((s) => s.department.code === 'PRODUCTION')
    if (!design || !prod) return reply.code(409).send({ error: 'no_design_step' })
    const isAdmin = u.roles.some((r) => r.role === 'admin')
    const isDesign = u.roles.some((r) => r.role === 'dept_head' && r.departmentId === design.departmentId)
    if (!isAdmin && !isDesign) return reply.code(403).send({ error: 'forbidden' })
    if (design.status === 'completed') return reply.code(409).send({ error: 'already_released' })

    const now = new Date()
    await prisma.$transaction(async (tx) => {
      await tx.jobStep.update({ where: { id: design.id }, data: { status: 'completed', completedAt: now, completedById: u.sub, version: { increment: 1 } } })
      // Production stays pending — PPC forwards it. Status reflects "awaiting PPC forward".
      await tx.job.update({ where: { id }, data: { status: 'approved', designDoneAt: now, designFileUrl: body.data.fileUrl ?? undefined, version: { increment: 1 } } })
      await tx.jobEvent.create({ data: { jobId: id, jobStepId: design.id, type: 'completed', actorId: u.sub, body: `Design${body.data.fileUrl ? ' · drawing attached' : ' · standard confirmed'}${body.data.note ? ` · ${body.data.note}` : ''} → back to PPC` } })
      await notifyAdmins(tx, { type: 'ppc_approval', jobId: id, body: `${job.displayLabel} design confirmed — PPC to forward to production` })
      await writeAudit('job', id, 'design_done', { actorId: u.sub, after: { file: !!body.data.fileUrl }, tx })
    })
    return { ok: true }
  })

  // ── PPC forwards a design-confirmed job to Production (§1a), optionally SPLIT ─
  // PPC tells production what/how to make it. splitInto > 1 divides the job into N
  // equal child jobs (the parent is retired); each child is forwarded to production.
  app.post('/:id/forward', { preHandler: requireRole('admin', 'ppc') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ splitInto: z.number().int().min(1).max(20).default(1), note: z.string().max(500).optional() }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const u = req.user as AccessPayload
    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        displayLabel: true, totalQty: true, status: true, designDoneAt: true, forwardedAt: true, productId: true, name: true, priority: true, orderId: true, orderItemId: true, source: true,
        models: { select: { modelId: true, size: true, quantity: true } },
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, status: true, departmentId: true, department: { select: { code: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    if (!job.designDoneAt) return reply.code(409).send({ error: 'design_not_done', hint: 'design must confirm first' })
    if (job.forwardedAt) return reply.code(409).send({ error: 'already_forwarded' })
    const prod = job.steps.find((s) => s.department.code === 'PRODUCTION')
    if (!prod) return reply.code(409).send({ error: 'no_production_step' })

    const now = new Date()
    const { stationDueAt } = await import('../lib/sla.js')
    const dueAt = await stationDueAt(job.totalQty, now)
    const splitInto = body.data.splitInto

    // simple split: N children, each gets ceil/floor share of every model's qty
    if (splitInto > 1) {
      const children: string[] = []
      for (let i = 0; i < splitInto; i++) {
        const models = job.models
          .map((m) => ({ modelId: m.modelId, size: m.size, quantity: Math.floor(m.quantity / splitInto) + (i < m.quantity % splitInto ? 1 : 0) }))
          .filter((m) => m.quantity > 0)
        if (models.length === 0) continue
        const res = await createJobFromInput(
          { productId: job.productId, name: job.name ? `${job.name} (${i + 1}/${splitInto})` : undefined, priority: job.priority as 'normal' | 'urgent', orderId: job.orderId, orderItemId: job.orderItemId, models },
          { actorId: u.sub, source: job.source as 'admin' | 'ppc' },
        )
        if (res.ok) {
          // children skip design (already done) → forward straight to production
          await prisma.$transaction(async (tx) => {
            const cd = await tx.jobStep.findFirst({ where: { jobId: res.job.id, department: { code: 'DESIGN' } }, select: { id: true } })
            const cp = await tx.jobStep.findFirst({ where: { jobId: res.job.id, department: { code: 'PRODUCTION' } }, select: { id: true } })
            if (cd) await tx.jobStep.update({ where: { id: cd.id }, data: { status: 'completed', completedAt: now, completedById: u.sub } })
            if (cp) await tx.jobStep.update({ where: { id: cp.id }, data: { status: 'in_progress', acceptedAt: now, acceptedById: u.sub, slaDueAt: dueAt } })
            await tx.job.update({ where: { id: res.job.id }, data: { status: 'in_production', parentJobId: id, designDoneAt: now, forwardedAt: now } })
          })
          children.push(res.job.displayLabel)
        }
      }
      // retire the parent — it lives on through its children
      await prisma.$transaction(async (tx) => {
        await tx.jobStep.updateMany({ where: { jobId: id, status: { in: ['pending', 'waiting_acceptance', 'in_progress'] } }, data: { status: 'skipped' } })
        await tx.job.update({ where: { id }, data: { status: 'cancelled', cancelledReason: `split into ${children.length}`, forwardedAt: now, version: { increment: 1 } } })
        await tx.jobEvent.create({ data: { jobId: id, type: 'split', actorId: u.sub, body: `Split into ${children.length}: ${children.join(', ')}` } })
        if (prod) await notifyDepartment(tx, prod.departmentId, { type: 'new_job', jobId: id, body: `${job.displayLabel} split into ${children.length} and forwarded to production` })
        await writeAudit('job', id, 'forward_split', { actorId: u.sub, after: { children: children.length }, tx })
      })
      return { ok: true, split: children.length, children }
    }

    // no split — forward this job straight to production
    await prisma.$transaction(async (tx) => {
      if (prod.status === 'pending' || prod.status === 'waiting_acceptance') {
        await tx.jobStep.update({ where: { id: prod.id }, data: { status: 'in_progress', acceptedAt: now, acceptedById: u.sub, slaDueAt: dueAt, version: { increment: 1 } } })
      }
      await tx.job.update({ where: { id }, data: { status: 'in_production', forwardedAt: now, version: { increment: 1 } } })
      await tx.jobEvent.create({ data: { jobId: id, type: 'accepted', actorId: u.sub, body: `PPC forwarded to Production${body.data.note ? ` · ${body.data.note}` : ''}` } })
      await notifyDepartment(tx, prod.departmentId, { type: 'new_job', jobId: id, body: `${job.displayLabel} forwarded to Production by PPC` })
      await writeAudit('job', id, 'forward', { actorId: u.sub, tx })
    })
    return { ok: true, split: 1 }
  })

  // ── jobs awaiting PPC forward (design confirmed, not yet forwarded) ──────────
  app.get('/awaiting-forward', { preHandler: requireRole('admin', 'ppc') }, async () => {
    const jobs = await prisma.job.findMany({
      where: { designDoneAt: { not: null }, forwardedAt: null, status: { notIn: ['cancelled', 'closed'] } },
      orderBy: { designDoneAt: 'asc' },
      select: { id: true, jobNo: true, displayLabel: true, name: true, totalQty: true, priority: true, designFileUrl: true, product: { select: { code: true, name: true } }, order: { select: { orderNo: true, client: true } } },
    })
    return { jobs: jobs.map((j) => ({ ...j, hasDesignFile: !!j.designFileUrl, designFileUrl: undefined })) }
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

  // ── printable PRODUCTION RECORD (as-built dossier: trail/QC/serials/material) ──
  app.get('/:id/record', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        stationVisits: { orderBy: { scanInAt: 'asc' }, include: { station: { select: { name: true } } } },
        qc: { orderBy: { createdAt: 'asc' } },
        serials: { orderBy: { createdAt: 'asc' }, select: { serialNo: true } },
        materials: { orderBy: { createdAt: 'asc' }, select: { item: true, quantity: true, vendor: true, batchRef: true } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    // resolve operator/inspector names in one query
    const userIds = [...new Set([...job.stationVisits.map((v) => v.operatorId), ...job.qc.map((q) => q.inspectorId)])]
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    const nameOf = (uid: string) => users.find((u) => u.id === uid)?.fullName ?? '—'
    const visited = new Set(job.stationVisits.map((v) => v.station.name))
    const allStations = await prisma.station.findMany({ orderBy: { sortOrder: 'asc' }, select: { name: true } })
    const html = renderJobRecord({
      displayLabel: job.displayLabel,
      name: job.name,
      productName: job.product.name,
      priority: job.priority,
      totalQty: job.totalQty,
      status: job.status.replace(/_/g, ' '),
      createdAt: job.createdAt,
      completionDate: job.completionDate,
      visits: job.stationVisits.map((v) => ({ station: v.station.name, operator: nameOf(v.operatorId), inAt: v.scanInAt, outAt: v.scanOutAt, outMode: v.scanOutMode, remark: v.remark })),
      qc: job.qc.map((q) => ({ result: q.result, inspector: nameOf(q.inspectorId), notes: q.notes, at: q.createdAt })),
      serials: job.serials.map((s) => s.serialNo),
      materials: job.materials,
      neverScanned: allStations.filter((s) => !visited.has(s.name)).map((s) => s.name),
    })
    return reply.type('text/html; charset=utf-8').send(html)
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
