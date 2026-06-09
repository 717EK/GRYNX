import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyDepartment, notifyAdmins } from '../lib/notify.js'
import { acceptanceDueAt } from '../lib/sla.js'

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

  // jobs at QC (arrived / in progress)
  app.get('/queue', async () => {
    const steps = await prisma.jobStep.findMany({
      where: {
        department: { code: 'QC' },
        status: { in: ['waiting_acceptance', 'in_progress'] },
        job: { status: { notIn: ['closed', 'cancelled'] } },
      },
      orderBy: [{ status: 'asc' }, { slaDueAt: 'asc' }],
      select: { status: true, job: { select: jobBrief } },
    })
    return { jobs: steps.map((s) => ({ ...s.job, stepStatus: s.status })) }
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

  // rework → records the inspection + notifies admin (rework job spawning is V2)
  app.post('/:jobId/rework', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z.object({ notes: z.string().min(1).max(500) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'notes_required' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { displayLabel: true } })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    await prisma.$transaction(async (tx) => {
      await tx.qcInspection.create({ data: { jobId, result: 'rework', inspectorId: actorId, notes: body.data.notes } })
      await tx.jobEvent.create({ data: { jobId, type: 'qc_result', actorId, body: `rework: ${body.data.notes}` } })
      await writeAudit('job', jobId, 'qc_rework', { actorId, after: { notes: body.data.notes }, tx })
      await notifyAdmins(tx, { type: 'escalation', body: `QC rework on ${job.displayLabel}: ${body.data.notes}`, jobId })
    })
    return { ok: true }
  })
}
