import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyDepartment, notifyAdmins } from '../lib/notify.js'
import { acceptanceDueAt, stationDueAt } from '../lib/sla.js'

const jobBrief = {
  id: true,
  jobNo: true,
  displayLabel: true,
  priority: true,
  totalQty: true,
  status: true,
  product: { select: { code: true, name: true } },
}

export async function qcRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // jobs QC can act on: already at QC, plus jobs still IN PRODUCTION (so QC can
  // receive them in when they physically arrive — pipeline-v2 has no QC arm-scan).
  app.get('/queue', async () => {
    const steps = await prisma.jobStep.findMany({
      where: {
        OR: [
          { department: { code: 'QC' }, status: { in: ['waiting_acceptance', 'in_progress'] } },
          { department: { code: 'PRODUCTION' }, status: 'in_progress' },
        ],
        job: { status: { notIn: ['closed', 'cancelled'] } },
      },
      orderBy: [{ slaDueAt: 'asc' }],
      select: { status: true, department: { select: { code: true } }, job: { select: jobBrief } },
    })
    return { jobs: steps.map((s) => ({ ...s.job, stepStatus: s.status, atProduction: s.department.code === 'PRODUCTION' })) }
  })

  // QC receives a job out of Production → completes Production (auto-outs any open
  // station visits) and opens QC. (Equivalent to a QC arrival gate-scan.)
  app.post('/:jobId/receive', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, status: true, department: { select: { code: true } } } },
        stationVisits: { where: { scanOutAt: null }, select: { id: true } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const prod = job.steps.find((s) => s.department.code === 'PRODUCTION')
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    if (!prod || prod.status !== 'in_progress') return reply.code(409).send({ error: 'not_in_production' })
    const now = new Date()
    const dueAt = await acceptanceDueAt()
    await prisma.$transaction(async (tx) => {
      for (const v of job.stationVisits) {
        await tx.stationVisit.updateMany({ where: { id: v.id, scanOutAt: null }, data: { scanOutAt: now, scanOutMode: 'auto', version: { increment: 1 } } })
      }
      if (job.stationVisits.length) await tx.jobEvent.create({ data: { jobId, type: 'station_out', actorId, body: '★ auto-out on QC receive' } })
      await tx.jobStep.update({ where: { id: prod.id }, data: { status: 'completed', completedAt: now, completedById: actorId, version: { increment: 1 } } })
      if (qcStep) await tx.jobStep.update({ where: { id: qcStep.id }, data: { status: 'in_progress', acceptedAt: now, acceptedById: actorId, slaDueAt: dueAt, version: { increment: 1 } } })
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_qc', version: { increment: 1 } } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: prod.id, type: 'completed', actorId, body: 'Production' } })
      await writeAudit('job', jobId, 'qc_receive', { actorId, after: { status: 'in_qc' }, tx })
    })
    return { ok: true }
  })

  // approve → completes QC, arms FG, records the inspection
  app.post('/:jobId/approve', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z.object({ notes: z.string().max(500).optional() }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { steps: { orderBy: { sequence: 'asc' }, include: { department: { select: { code: true } } } } },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    const fgStep = job.steps.find((s) => s.department.code === 'FG_STOCK')
    if (!qcStep || (qcStep.status !== 'in_progress' && qcStep.status !== 'waiting_acceptance'))
      return reply.code(409).send({ error: 'not_at_qc' })

    const fgDue = await acceptanceDueAt()
    await prisma.$transaction(async (tx) => {
      await tx.jobStep.update({ where: { id: qcStep.id }, data: { status: 'completed', completedAt: new Date(), completedById: actorId, version: { increment: 1 } } })
      if (fgStep) {
        await tx.jobStep.update({ where: { id: fgStep.id }, data: { status: 'waiting_acceptance', slaDueAt: fgDue } })
        await notifyDepartment(tx, fgStep.departmentId, { type: 'new_job', jobId, body: `${job.displayLabel} passed QC → FG Stock` })
      }
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_fg', version: { increment: 1 } } })
      await tx.qcInspection.create({ data: { jobId, result: 'approved', inspectorId: actorId, notes: body.notes ?? null } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: qcStep.id, type: 'qc_result', actorId, body: 'approved' } })
      await writeAudit('job', jobId, 'qc_approve', { actorId, after: { status: 'in_fg' }, tx })
    })
    return { ok: true }
  })

  // pipeline-v2: rework goes back to PRODUCTION. QC may aim it at a specific
  // station (reworkStationId) or leave it for the production head to route.
  app.get('/:jobId/rework-targets', { preHandler: requireRole('admin', 'qc') }, async (_req, reply) => {
    const stations = await prisma.station.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true } })
    // null target = "back to Production — head decides which station"
    return { stations }
  })

  // rework → reopen PRODUCTION (the job re-flows: stations re-scan, then QC pulls it
  // back). Records the inspection with the issue note + optional defect photo and an
  // optional target station; notifies the floor + admins.
  app.post('/:jobId/rework', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z
      .object({
        notes: z.string().min(1).max(500),
        reworkStationId: z.string().uuid().optional(), // specific station, else back to Production
        photoUrl: z.string().max(3_000_000).optional(), // defect photo (data URL)
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: 'notes required' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        displayLabel: true,
        totalQty: true,
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, status: true, version: true, departmentId: true, department: { select: { code: true, name: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    const prodStep = job.steps.find((s) => s.department.code === 'PRODUCTION')
    if (!qcStep || (qcStep.status !== 'in_progress' && qcStep.status !== 'waiting_acceptance'))
      return reply.code(409).send({ error: 'not_at_qc' })
    if (!prodStep) return reply.code(409).send({ error: 'no_production_step' })

    let targetStation: { id: string; name: string } | null = null
    if (body.data.reworkStationId) {
      targetStation = await prisma.station.findUnique({ where: { id: body.data.reworkStationId }, select: { id: true, name: true } })
      if (!targetStation) return reply.code(400).send({ error: 'invalid_target_station' })
    }
    const where = targetStation ? ` → ${targetStation.name}` : ' → Production (head decides)'

    const dueAt = await stationDueAt(job.totalQty)
    await prisma.$transaction(async (tx) => {
      // reopen PRODUCTION, reset QC back to pending
      await tx.jobStep.update({
        where: { id: prodStep.id },
        data: { status: 'in_progress', completedAt: null, completedById: null, slaDueAt: dueAt, version: { increment: 1 } },
      })
      await tx.jobStep.update({
        where: { id: qcStep.id },
        data: { status: 'pending', acceptedAt: null, acceptedById: null, completedAt: null, completedById: null, slaDueAt: null, version: { increment: 1 } },
      })
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_production', version: { increment: 1 } } })
      await tx.qcInspection.create({ data: { jobId, result: 'rework', inspectorId: actorId, notes: body.data.notes, photoUrl: body.data.photoUrl ?? null, reworkStationId: targetStation?.id ?? null } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: qcStep.id, type: 'qc_result', actorId, body: `rework${where}: ${body.data.notes}` } })
      await notifyDepartment(tx, prodStep.departmentId, { type: 'new_job', jobId, body: `Rework: ${job.displayLabel} back to Production${targetStation ? ` (${targetStation.name})` : ''} — ${body.data.notes}` })
      await notifyAdmins(tx, { type: 'escalation', body: `QC rework on ${job.displayLabel}${where}: ${body.data.notes}`, jobId })
      await writeAudit('job', jobId, 'qc_rework', { actorId, after: { reworkStation: targetStation?.name ?? null, notes: body.data.notes }, tx })
    })
    return { ok: true, sentBackTo: targetStation?.name ?? 'Production' }
  })
}
