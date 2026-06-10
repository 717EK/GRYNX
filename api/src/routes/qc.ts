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

  // production departments a job can be sent back to on rework (steps before QC)
  app.get('/:jobId/rework-targets', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { steps: { orderBy: { sequence: 'asc' }, select: { sequence: true, departmentId: true, department: { select: { code: true, name: true } } } } },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const qcSeq = job.steps.find((s) => s.department.code === 'QC')?.sequence ?? Infinity
    const targets = job.steps
      .filter((s) => s.sequence < qcSeq && s.department.code !== 'FG_STOCK')
      .map((s) => ({ departmentId: s.departmentId, code: s.department.code, name: s.department.name }))
    return { targets }
  })

  // rework → reroute the job back to a chosen production department, then it
  // re-flows up to QC. Resets the target station (re-armed) + everything between
  // it and QC; records the inspection; notifies the floor + admins.
  app.post('/:jobId/rework', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z.object({ notes: z.string().min(1).max(500), toDepartmentId: z.string().uuid() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: 'notes + toDepartmentId required' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        displayLabel: true, version: true,
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, sequence: true, status: true, version: true, departmentId: true, department: { select: { code: true, name: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    if (!qcStep || (qcStep.status !== 'in_progress' && qcStep.status !== 'waiting_acceptance'))
      return reply.code(409).send({ error: 'not_at_qc' })
    const target = job.steps.find((s) => s.departmentId === body.data.toDepartmentId && s.sequence < qcStep.sequence)
    if (!target) return reply.code(400).send({ error: 'invalid_target_department' })

    const dueAt = await acceptanceDueAt()
    await prisma.$transaction(async (tx) => {
      // re-arm the target station; reset every step between it and QC (inclusive) to pending
      for (const s of job.steps) {
        if (s.sequence < target.sequence || s.sequence > qcStep.sequence) continue
        const reset = { acceptedAt: null, acceptedById: null, completedAt: null, completedById: null }
        if (s.id === target.id) {
          await tx.jobStep.update({ where: { id: s.id }, data: { ...reset, status: 'waiting_acceptance', slaDueAt: dueAt, version: { increment: 1 } } })
        } else {
          await tx.jobStep.update({ where: { id: s.id }, data: { ...reset, status: 'pending', slaDueAt: null, version: { increment: 1 } } })
        }
      }
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_production', version: { increment: 1 } } })
      await tx.qcInspection.create({ data: { jobId, result: 'rework', inspectorId: actorId, notes: body.data.notes } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: qcStep.id, type: 'qc_result', actorId, body: `rework → ${target.department.name}: ${body.data.notes}` } })
      await notifyDepartment(tx, target.departmentId, { type: 'new_job', jobId, body: `Rework: ${job.displayLabel} sent back to ${target.department.name} — ${body.data.notes}` })
      await notifyAdmins(tx, { type: 'escalation', body: `QC rework on ${job.displayLabel} → ${target.department.name}: ${body.data.notes}`, jobId })
      await writeAudit('job', jobId, 'qc_rework', { actorId, after: { sentBackTo: target.department.code, notes: body.data.notes }, tx })
    })
    return { ok: true, sentBackTo: target.department.name }
  })
}
