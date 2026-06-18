import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { moveStock, getAvailable, normSize } from '../lib/stock.js'

// FG inventory (docs/12 phase 5). Read for any authed user (PPC checks availability);
// adjusting on-hand is FG + admin. Reservations happen via the orders route.
export async function stockRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // full stock list (on-hand / reserved / available) + recent movements count
  app.get('/', async () => {
    const items = await prisma.stockItem.findMany({
      orderBy: [{ product: { code: 'asc' } }, { size: 'asc' }],
      select: { id: true, productId: true, modelId: true, size: true, onHand: true, reserved: true, updatedAt: true, product: { select: { code: true, name: true } }, model: { select: { code: true, name: true } } },
    })
    return { items: items.map((i) => ({ ...i, available: i.onHand - i.reserved })) }
  })

  // availability for a specific product+model+size (PPC's from-stock check)
  app.get('/available', async (req) => {
    const q = z.object({ productId: z.string().uuid(), modelId: z.string().uuid(), size: z.string().optional() }).parse(req.query)
    return getAvailable({ productId: q.productId, modelId: q.modelId, size: normSize(q.size) })
  })

  // FG / admin enter opening stock or correct a count (absolute on-hand)
  app.post('/adjust', { preHandler: requireRole('admin', 'fg_stock') }, async (req, reply) => {
    const body = z
      .object({ productId: z.string().uuid(), modelId: z.string().uuid(), size: z.string().max(20).optional(), onHand: z.number().int().min(0), note: z.string().max(200).optional(), opening: z.boolean().optional() })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const res = await moveStock({
      key: { productId: body.data.productId, modelId: body.data.modelId, size: normSize(body.data.size) },
      kind: body.data.opening ? 'opening' : 'adjust',
      qty: 0,
      setOnHand: body.data.onHand,
      actorId,
      note: body.data.note,
    })
    if (!res.ok) return reply.code(409).send({ error: res.error })
    await writeAudit('stock', res.stockItemId, 'adjust', { actorId, after: { onHand: res.onHand } })
    return { ok: true, onHand: res.onHand, reserved: res.reserved, available: res.available }
  })

  // movement history for one stock item (audit)
  app.get('/:id/movements', { preHandler: requireRole('admin', 'fg_stock') }, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const movements = await prisma.stockMovement.findMany({ where: { stockItemId: id }, orderBy: { createdAt: 'desc' }, take: 100 })
    return { movements }
  })
}
