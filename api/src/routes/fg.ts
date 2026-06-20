import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins, notifyUsers } from '../lib/notify.js'
import { moveStock, normSize } from '../lib/stock.js'
import { orderReady } from './dispatch.js'

const jobBrief = {
  id: true,
  jobNo: true,
  displayLabel: true,
  priority: true,
  totalQty: true,
  status: true,
  product: { select: { code: true, name: true } },
}

export async function fgRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // jobs at FG Stock (arrived from QC)
  app.get('/queue', async () => {
    const steps = await prisma.jobStep.findMany({
      where: {
        department: { code: 'FG_STOCK' },
        status: { in: ['waiting_acceptance', 'in_progress'] },
        job: { status: { notIn: ['closed', 'cancelled'] } },
      },
      orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }],
      select: { status: true, job: { select: { ...jobBrief, _count: { select: { serials: true } } } } },
    })
    return { jobs: steps.map((s) => ({ ...s.job, stepStatus: s.status, serialCount: s.job._count.serials })) }
  })

  app.get('/:jobId/serials', async (req) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const serials = await prisma.serial.findMany({ where: { jobId }, orderBy: { createdAt: 'asc' }, select: { id: true, serialNo: true, modelCode: true, size: true } })
    return { serials }
  })

  // FG types/pastes serial numbers (one per produced unit)
  app.post('/:jobId/serials', { preHandler: requireRole('admin', 'fg_stock') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z.object({ serials: z.array(z.string().trim().min(1).max(60)).min(1), modelCode: z.string().max(40).optional(), size: z.string().max(20).optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const clean = [...new Set(body.data.serials.map((s) => s.trim()).filter(Boolean))]
    const res = await prisma.serial.createMany({
      data: clean.map((serialNo) => ({ jobId, serialNo, modelCode: body.data.modelCode ?? null, size: body.data.size ?? null, addedById: actorId })),
      skipDuplicates: true,
    })
    await writeAudit('job', jobId, 'serials_added', { actorId, after: { count: res.count } })
    return { added: res.count }
  })

  // pipeline-v2: FG enters serial(s) + closes the job in one step. This is the
  // ONE definitive terminal event — the job closes and admins are notified. If a
  // station marked `isCritical` was never scanned for this job, we SOFT-FLAG it
  // (note + admin alert) but still allow the close (traceability = soft-flag).
  app.post('/:jobId/close', { preHandler: requireRole('admin', 'fg_stock') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const cbody = z
      .object({
        serials: z.array(z.string().trim().min(1).max(60)).optional(),
        modelCode: z.string().max(40).optional(),
        size: z.string().max(20).optional(),
        receivedQty: z.number().int().min(0).optional(),
      })
      .safeParse(req.body ?? {})
    if (!cbody.success) return reply.code(400).send({ error: 'bad_request' })
    const closeActorId = (req.user as AccessPayload).sub

    const cjob = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        displayLabel: true,
        status: true,
        productId: true,
        orderId: true,
        orderItemId: true,
        order: { select: { client: true } },
        models: { select: { modelId: true, size: true, quantity: true } },
        steps: { where: { department: { code: 'FG_STOCK' } }, select: { id: true, status: true } },
        _count: { select: { serials: true } },
      },
    })
    if (!cjob) return reply.code(404).send({ error: 'not_found' })
    if (cjob.status === 'closed' || cjob.status === 'cancelled') return reply.code(409).send({ error: 'job_terminal', status: cjob.status })
    const fgStep = cjob.steps[0]

    // QC parallel-department guard (docs/12): only an ADMIN-APPROVED HARD HOLD blocks
    // the close. Plain QC issues (and legacy per-station flags) are SOFT — they don't
    // stop the close, they just flag it + notify admin. Quality is advisory for
    // movement; a hard hold is the deliberate, admin-approved wall at the door.
    const hardHolds = await prisma.qcObservation.findMany({
      where: { jobId, status: 'open', holdApproved: true },
      select: { note: true, station: { select: { name: true } } },
    })
    if (hardHolds.length > 0) {
      return reply.code(409).send({
        error: 'qc_hard_hold',
        count: hardHolds.length,
        holds: hardHolds.map((h) => ({ station: h.station?.name ?? null, note: h.note })),
        hint: 'an admin-approved QC hard hold is active — resolve it before closing',
      })
    }
    // open SOFT issues → flag the close (still allowed): new QcObservation issues +
    // any legacy open per-station StationVisit flags.
    const [softObs, legacyOpen] = await Promise.all([
      prisma.qcObservation.findMany({ where: { jobId, status: 'open', kind: 'issue', holdApproved: false }, select: { note: true, severity: true, station: { select: { name: true } } } }),
      prisma.stationVisit.findMany({ where: { jobId, qcIssue: true, qcResolvedAt: null }, select: { qcNote: true, station: { select: { name: true } } } }),
    ])
    const softFlags = [
      ...softObs.map((s) => `${s.station?.name ?? 'QC'}${s.severity ? ` (${s.severity})` : ''}: ${s.note}`),
      ...legacyOpen.map((v) => `${v.station.name}: ${v.qcNote ?? 'issue'}`),
    ]

    // serials: accept new ones now (one per finished unit). At least one must exist.
    const incoming = [...new Set((cbody.data.serials ?? []).map((s) => s.trim()).filter(Boolean))]
    const totalSerials = cjob._count.serials + incoming.length
    if (totalSerials < 1) return reply.code(400).send({ error: 'serial_required', hint: 'enter at least one serial number to close' })

    // informational: note every station this job was NEVER scanned at (no curated
    // critical list — the close note + record simply show the gaps; never blocks)
    const allStations = await prisma.station.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: 'asc' } })
    const visited = await prisma.stationVisit.findMany({ where: { jobId }, select: { stationId: true } })
    const visitedIds = new Set(visited.map((v) => v.stationId))
    const missing = allStations.filter((s) => !visitedIds.has(s.id)).map((s) => s.name)

    await prisma.$transaction(async (tx) => {
      if (incoming.length) {
        await tx.serial.createMany({
          data: incoming.map((serialNo) => ({ jobId, serialNo, modelCode: cbody.data.modelCode ?? null, size: cbody.data.size ?? null, addedById: closeActorId })),
          skipDuplicates: true,
        })
        await tx.jobEvent.create({ data: { jobId, type: 'serialized', actorId: closeActorId, body: `${incoming.length} serial${incoming.length > 1 ? 's' : ''} added` } })
      }
      if (fgStep && fgStep.status !== 'completed') {
        await tx.jobStep.update({ where: { id: fgStep.id }, data: { status: 'completed', completedAt: new Date(), completedById: closeActorId, version: { increment: 1 } } })
      }
      await tx.closure.upsert({
        where: { jobId },
        update: { status: 'approved', approvedById: closeActorId, approvedAt: new Date(), receivedQty: cbody.data.receivedQty ?? totalSerials },
        create: { jobId, requestedById: closeActorId, approvedById: closeActorId, approvedAt: new Date(), status: 'approved', receivedQty: cbody.data.receivedQty ?? totalSerials },
      })
      await tx.job.update({ where: { id: jobId }, data: { status: 'closed', completionDate: new Date(), version: { increment: 1 } } })
      const flagNote = [missing.length ? `never scanned at: ${missing.join(', ')}` : '', softFlags.length ? `⚠ closed with ${softFlags.length} open QC issue(s): ${softFlags.join('; ')}` : ''].filter(Boolean).join(' · ')
      await tx.jobEvent.create({ data: { jobId, type: 'closed', actorId: closeActorId, body: flagNote ? `closed · ${flagNote}` : 'closed' } })
      await writeAudit('job', jobId, 'fg_close', { actorId: closeActorId, after: { serials: totalSerials, neverScanned: missing, openQcIssues: softFlags }, tx })
      await notifyAdmins(tx, {
        type: 'closure_request',
        jobId,
        body: `${cjob.displayLabel} closed by FG (${totalSerials} serial${totalSerials > 1 ? 's' : ''})${missing.length ? ` · not scanned at: ${missing.join(', ')}` : ''}${softFlags.length ? ` · ⚠ ${softFlags.length} open QC issue(s)` : ''}`,
      })
    })

    // phase 5: produce the finished units into FG stock. For a made-to-order job
    // they're also RESERVED for that order (claimed, not free) until dispatch.
    for (const m of cjob.models) {
      const key = { productId: cjob.productId, modelId: m.modelId, size: normSize(m.size) }
      await moveStock({ key, kind: 'produced', qty: m.quantity, actorId: closeActorId, jobId, orderId: cjob.orderId, clientTag: cjob.order?.client ?? null, note: `produced · ${cjob.displayLabel}` })
      if (cjob.orderId) {
        await moveStock({ key, kind: 'reserve', qty: m.quantity, actorId: closeActorId, orderId: cjob.orderId, orderItemId: cjob.orderItemId, clientTag: cjob.order?.client ?? null, note: 'reserved (made to order)' })
      }
    }

    // phase 6: if this close makes the WHOLE order ready (every item made or from
    // stock) and there's no dispatch yet, FG auto-raises a dispatch request.
    if (cjob.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: cjob.orderId },
        select: { orderNo: true, client: true, items: { select: { id: true, fromStock: true } }, jobs: { select: { orderItemId: true, status: true } }, dispatch: { select: { id: true } } },
      })
      if (order && !order.dispatch && orderReady(order)) {
        await prisma.$transaction(async (tx) => {
          const d = await tx.dispatch.create({ data: { orderId: cjob.orderId!, raisedBy: 'fg', requestedById: closeActorId, note: 'auto: whole order in stock' } })
          await tx.order.update({ where: { id: cjob.orderId! }, data: { status: 'ready' } })
          await notifyAdmins(tx, { type: 'closure_request', entityId: d.id, body: `${order.orderNo} (${order.client}) fully in stock — dispatch ready to approve` })
        })
      }
    }
    return { ok: true, closed: true, serials: totalSerials, missingCritical: missing, softQcFlags: softFlags }
  })

  // request closure → admin approves (closes the job)
  app.post('/:jobId/closure', { preHandler: requireRole('admin', 'fg_stock') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z.object({ receivedQty: z.number().int().min(0) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'received_qty_required' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { displayLabel: true, closure: { select: { id: true } } } })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    if (job.closure) return reply.code(409).send({ error: 'closure_exists' })
    await prisma.$transaction(async (tx) => {
      await tx.closure.create({ data: { jobId, requestedById: actorId, receivedQty: body.data.receivedQty, status: 'requested' } })
      await tx.job.update({ where: { id: jobId }, data: { status: 'close_requested' } })
      await tx.jobEvent.create({ data: { jobId, type: 'closure_requested', actorId, body: `received ${body.data.receivedQty}` } })
      await writeAudit('job', jobId, 'closure_request', { actorId, after: { receivedQty: body.data.receivedQty }, tx })
      await notifyAdmins(tx, { type: 'closure_request', body: `${job.displayLabel} ready to close (FG received ${body.data.receivedQty})`, jobId })
    })
    return { ok: true }
  })

  // admin approves closure → job closed
  app.post('/closure/:jobId/approve', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { displayLabel: true, closure: { select: { id: true, requestedById: true } }, steps: { where: { department: { code: 'FG_STOCK' } }, select: { id: true } } } })
    if (!job?.closure) return reply.code(404).send({ error: 'no_closure' })
    await prisma.$transaction(async (tx) => {
      await tx.closure.update({ where: { id: job.closure!.id }, data: { status: 'approved', approvedById: actorId, approvedAt: new Date() } })
      await tx.job.update({ where: { id: jobId }, data: { status: 'closed', completionDate: new Date() } })
      if (job.steps[0]) await tx.jobStep.update({ where: { id: job.steps[0].id }, data: { status: 'completed', completedAt: new Date(), completedById: actorId } })
      await tx.jobEvent.create({ data: { jobId, type: 'closed', actorId, body: 'closed' } })
      await writeAudit('job', jobId, 'closed', { actorId, after: { status: 'closed' }, tx })
      await notifyUsers(tx, [job.closure!.requestedById], { type: 'closure_request', body: `${job.displayLabel} closed`, jobId })
    })
    return { ok: true }
  })
}
