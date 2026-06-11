import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins } from '../lib/notify.js'

export async function purchaseRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // active jobs + how much raw material has been logged on each
  app.get('/jobs', async () => {
    const jobs = await prisma.job.findMany({
      where: { status: { notIn: ['closed', 'cancelled'] } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: {
        id: true,
        jobNo: true,
        displayLabel: true,
        priority: true,
        totalQty: true,
        status: true,
        product: { select: { code: true, name: true } },
        _count: { select: { materials: true } },
      },
    })
    return { jobs: jobs.map((j) => ({ ...j, materialCount: j._count.materials })) }
  })

  app.get('/:jobId/materials', async (req) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const materials = await prisma.materialUsage.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, item: true, materialType: true, vendor: true, batchRef: true, quantity: true },
    })
    return { materials }
  })

  // log a raw-material line (item / vendor / batch / type) against a job
  app.post('/:jobId/materials', { preHandler: requireRole('admin', 'dept_head') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z
      .object({
        item: z.string().min(1).max(120),
        materialType: z.string().max(60).optional(),
        vendor: z.string().max(120).optional(),
        batchRef: z.string().max(80).optional(),
        quantity: z.string().max(40).optional(),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const m = await prisma.materialUsage.create({
      data: {
        jobId,
        item: body.data.item,
        materialType: body.data.materialType ?? null,
        vendor: body.data.vendor ?? null,
        batchRef: body.data.batchRef ?? null,
        quantity: body.data.quantity ?? null,
        loggedById: actorId,
      },
      select: { id: true, item: true, materialType: true, vendor: true, batchRef: true, quantity: true },
    })
    await writeAudit('job', jobId, 'material_logged', { actorId, after: { item: m.item, vendor: m.vendor, batchRef: m.batchRef } })
    return reply.code(201).send({ material: m })
  })

  // genealogy search: what jobs used a given raw-material batch
  app.get('/by-batch/:batch', { preHandler: requireRole('admin') }, async (req) => {
    const { batch } = z.object({ batch: z.string().min(1) }).parse(req.params)
    const rows = await prisma.materialUsage.findMany({
      where: { batchRef: { contains: batch, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { item: true, vendor: true, batchRef: true, quantity: true, job: { select: { id: true, displayLabel: true, status: true } } },
    })
    return { usages: rows }
  })

  // ── pipeline-v2: material / purchase NEEDS (parallel, NON-blocking) ─────────
  // Design (or the floor) flags a shortage. Ordering happens OFF-app — we only
  // track needed → ordered → received. Production keeps working on available parts.
  const reqSelect = {
    id: true, item: true, quantity: true, status: true, note: true, vendor: true, raisedById: true, createdAt: true,
    job: { select: { id: true, displayLabel: true, name: true, status: true, product: { select: { name: true } } } },
  }

  // the purchase desk view — all open needs across jobs
  app.get('/requests', async (req) => {
    const q = z.object({ status: z.enum(['needed', 'ordered', 'received', 'cancelled']).optional() }).parse(req.query)
    const requests = await prisma.materialRequest.findMany({
      where: q.status ? { status: q.status } : { status: { notIn: ['received', 'cancelled'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: reqSelect,
    })
    return { requests }
  })

  // material needs for one job
  app.get('/:jobId/requests', async (req) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const requests = await prisma.materialRequest.findMany({ where: { jobId }, orderBy: { createdAt: 'desc' }, select: reqSelect })
    return { requests }
  })

  // raise a material need against a job (Design / floor / admin)
  app.post('/:jobId/requests', { preHandler: requireRole('admin', 'dept_head', 'ppc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z
      .object({ item: z.string().min(1).max(120), quantity: z.string().max(40).optional(), note: z.string().max(500).optional(), vendor: z.string().max(120).optional() })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { displayLabel: true } })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const created = await prisma.$transaction(async (tx) => {
      const mr = await tx.materialRequest.create({
        data: { jobId, item: body.data.item, quantity: body.data.quantity ?? null, note: body.data.note ?? null, vendor: body.data.vendor ?? null, raisedById: actorId, status: 'needed' },
        select: reqSelect,
      })
      await tx.jobEvent.create({ data: { jobId, type: 'material_request', actorId, body: `Need: ${body.data.item}${body.data.quantity ? ` · ${body.data.quantity}` : ''}` } })
      await notifyAdmins(tx, { type: 'hold_alert', jobId, body: `Material needed for ${job.displayLabel}: ${body.data.item}${body.data.quantity ? ` (${body.data.quantity})` : ''}` })
      await writeAudit('job', jobId, 'material_request', { actorId, after: { item: body.data.item }, tx })
      return mr
    })
    return reply.code(201).send({ request: created })
  })

  // update a need's state (needed → ordered → received) — off-app ordering reflected here
  app.patch('/requests/:id', { preHandler: requireRole('admin', 'dept_head', 'ppc') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z
      .object({ status: z.enum(['needed', 'ordered', 'received', 'cancelled']).optional(), vendor: z.string().max(120).optional(), note: z.string().max(500).optional() })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const existing = await prisma.materialRequest.findUnique({ where: { id }, select: { jobId: true, item: true } })
    if (!existing) return reply.code(404).send({ error: 'not_found' })
    const request = await prisma.$transaction(async (tx) => {
      const mr = await tx.materialRequest.update({
        where: { id },
        data: { status: body.data.status, vendor: body.data.vendor, note: body.data.note },
        select: reqSelect,
      })
      if (body.data.status) {
        await tx.jobEvent.create({ data: { jobId: existing.jobId, type: 'material_update', actorId, body: `${existing.item} → ${body.data.status}` } })
      }
      await writeAudit('material_request', id, 'material_update', { actorId, after: { status: body.data.status ?? null }, tx })
      return mr
    })
    return { request }
  })
}
