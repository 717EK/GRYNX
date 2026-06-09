import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins, notifyUsers } from '../lib/notify.js'

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
