import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'

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
}
