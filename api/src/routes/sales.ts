import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins } from '../lib/notify.js'

// pipeline-v2: the Sales desk. A sales user creates a Sale Sheet (customer + order
// scope) and hands it to PPC, who converts it into a PpcRequest (see ppc.ts —
// create accepts saleSheetId and marks the sheet `converted`).
const sheetSelect = {
  id: true,
  sheetNo: true,
  customer: true,
  orderName: true,
  details: true,
  targetDate: true,
  status: true,
  createdById: true,
  createdAt: true,
  request: { select: { id: true, requestNo: true, status: true } },
} as const

export async function salesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // list sale sheets (sales/ppc/admin); optional status filter
  app.get('/sheets', async (req) => {
    const q = z.object({ status: z.enum(['draft', 'submitted', 'converted', 'cancelled']).optional() }).parse(req.query)
    const sheets = await prisma.saleSheet.findMany({
      where: q.status ? { status: q.status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: sheetSelect,
    })
    return { sheets }
  })

  app.get('/sheets/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const sheet = await prisma.saleSheet.findUnique({ where: { id }, select: sheetSelect })
    if (!sheet) return reply.code(404).send({ error: 'not_found' })
    return { sheet }
  })

  // sales creates (and usually submits) a sale sheet → handed to PPC
  app.post('/sheets', { preHandler: requireRole('admin', 'sales') }, async (req, reply) => {
    const body = z
      .object({
        customer: z.string().min(1).max(120),
        orderName: z.string().max(120).optional(),
        details: z.string().max(4000).optional(),
        targetDate: z.coerce.date().optional(),
        submit: z.boolean().default(true),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const sheet = await prisma.$transaction(async (tx) => {
      const seq = (await tx.dailySequence.upsert({ where: { scope: 'salesheet:counter' }, update: { lastValue: { increment: 1 } }, create: { scope: 'salesheet:counter', lastValue: 1 } })).lastValue
      const s = await tx.saleSheet.create({
        data: {
          sheetNo: `SS-${String(seq).padStart(4, '0')}`,
          customer: body.data.customer,
          orderName: body.data.orderName ?? null,
          details: body.data.details ?? null,
          targetDate: body.data.targetDate ?? null,
          status: body.data.submit ? 'submitted' : 'draft',
          createdById: actorId,
        },
        select: sheetSelect,
      })
      if (s.status === 'submitted') {
        await notifyAdmins(tx, { type: 'ppc_approval', entityId: s.id, body: `New sale sheet ${s.sheetNo} from ${s.customer}${s.orderName ? ` — ${s.orderName}` : ''}` })
      }
      await writeAudit('sale_sheet', s.id, 'created', { actorId, after: { sheetNo: s.sheetNo, status: s.status }, tx })
      return s
    })
    return reply.code(201).send({ sheet })
  })

  // edit / submit / cancel a sheet (not once converted)
  app.patch('/sheets/:id', { preHandler: requireRole('admin', 'sales') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z
      .object({
        customer: z.string().min(1).max(120).optional(),
        orderName: z.string().max(120).optional(),
        details: z.string().max(4000).optional(),
        targetDate: z.coerce.date().optional(),
        status: z.enum(['draft', 'submitted', 'cancelled']).optional(),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const existing = await prisma.saleSheet.findUnique({ where: { id }, select: { status: true } })
    if (!existing) return reply.code(404).send({ error: 'not_found' })
    if (existing.status === 'converted') return reply.code(409).send({ error: 'already_converted' })
    const sheet = await prisma.saleSheet.update({ where: { id }, data: { ...body.data }, select: sheetSelect })
    await writeAudit('sale_sheet', id, 'updated', { actorId, after: { status: sheet.status } })
    return { sheet }
  })
}
