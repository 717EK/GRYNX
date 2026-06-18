import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins } from '../lib/notify.js'
import { moveStock, normSize } from '../lib/stock.js'

// Dispatch (docs/12 phase 6). Ships the WHOLE order, never partial. Two-way:
// Sales/PPC request → admin approves → ship; OR FG auto-raises a request when the
// order is fully in stock (see fg.ts close). Shipping DEDUCTS stock (closes the loop).

// every line-item resolved = has a closed job OR is fulfilled from stock
type OrderForReady = { items: { id: string; fromStock: boolean }[]; jobs: { orderItemId: string | null; status: string }[] }
export function orderReady(o: OrderForReady) {
  return o.items.length > 0 && o.items.every((i) => i.fromStock || o.jobs.some((j) => j.orderItemId === i.id && j.status === 'closed'))
}

async function resolveModelId(productId: string, modelId: string | null) {
  if (modelId) return modelId
  return (await prisma.model.findFirst({ where: { productId, active: true }, select: { id: true } }))?.id ?? null
}

export async function dispatchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req) => {
    const q = z.object({ status: z.string().optional() }).parse(req.query)
    const dispatches = await prisma.dispatch.findMany({
      where: q.status ? { status: q.status as never } : { status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { id: true, orderNo: true, name: true, client: true, priority: true, status: true, items: { select: { quantity: true } } } } },
    })
    return { dispatches }
  })

  // request dispatch for an order — only when every item is resolved (in stock)
  app.post('/request', { preHandler: requireRole('admin', 'sales', 'ppc', 'fg_stock') }, async (req, reply) => {
    const body = z.object({ orderId: z.string().uuid(), note: z.string().max(300).optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const u = req.user as AccessPayload
    const order = await prisma.order.findUnique({
      where: { id: body.data.orderId },
      select: { orderNo: true, client: true, items: { select: { id: true, fromStock: true } }, jobs: { select: { orderItemId: true, status: true } }, dispatch: { select: { id: true } } },
    })
    if (!order) return reply.code(404).send({ error: 'not_found' })
    if (order.dispatch) return reply.code(409).send({ error: 'dispatch_exists' })
    if (!orderReady(order)) return reply.code(409).send({ error: 'order_not_ready', hint: 'every item must be made or reserved from stock first' })
    const raisedBy = u.roles.some((r) => r.role === 'sales') ? 'sales' : u.roles.some((r) => r.role === 'fg_stock') ? 'fg' : u.roles.some((r) => r.role === 'admin') ? 'admin' : 'ppc'
    const dispatch = await prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.create({ data: { orderId: body.data.orderId, raisedBy, requestedById: u.sub, note: body.data.note ?? null } })
      await tx.order.update({ where: { id: body.data.orderId }, data: { status: 'ready' } })
      await notifyAdmins(tx, { type: 'closure_request', entityId: d.id, body: `Dispatch requested for ${order.orderNo} (${order.client}) — approve to ship` })
      await writeAudit('dispatch', d.id, 'request', { actorId: u.sub, after: { raisedBy }, tx })
      return d
    })
    return reply.code(201).send({ dispatch })
  })

  app.post('/:id/approve', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const d = await prisma.dispatch.findUnique({ where: { id }, select: { status: true } })
    if (!d) return reply.code(404).send({ error: 'not_found' })
    if (d.status !== 'requested') return reply.code(409).send({ error: 'not_requested', status: d.status })
    await prisma.dispatch.update({ where: { id }, data: { status: 'approved', approvedById: actorId, approvedAt: new Date() } })
    await writeAudit('dispatch', id, 'approve', { actorId })
    return { ok: true }
  })

  // ship the whole order → DEDUCT stock for every item, close the order
  app.post('/:id/ship', { preHandler: requireRole('admin', 'fg_stock') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ vehicle: z.string().max(120).optional(), note: z.string().max(300).optional() }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const d = await prisma.dispatch.findUnique({
      where: { id },
      select: { status: true, orderId: true, order: { select: { orderNo: true, items: { select: { id: true, productId: true, modelId: true, size: true, quantity: true } } } } },
    })
    if (!d) return reply.code(404).send({ error: 'not_found' })
    if (d.status === 'shipped') return reply.code(409).send({ error: 'already_shipped' })
    if (d.status !== 'approved') return reply.code(409).send({ error: 'not_approved', hint: 'admin must approve the dispatch first' })

    // deduct each item's quantity from FG stock (reserved → out)
    for (const item of d.order.items) {
      const modelId = await resolveModelId(item.productId, item.modelId)
      if (!modelId) continue
      await moveStock({ key: { productId: item.productId, modelId, size: normSize(item.size) }, kind: 'dispatch', qty: item.quantity, actorId, orderId: d.orderId, orderItemId: item.id, note: `dispatched · ${d.order.orderNo}` })
    }
    await prisma.$transaction(async (tx) => {
      await tx.dispatch.update({ where: { id }, data: { status: 'shipped', shippedById: actorId, shippedAt: new Date(), vehicle: body.data.vehicle ?? null, note: body.data.note ?? undefined } })
      await tx.order.update({ where: { id: d.orderId }, data: { status: 'dispatched' } })
      await writeAudit('order', d.orderId, 'dispatched', { actorId, after: { dispatchId: id }, tx })
      await notifyAdmins(tx, { type: 'closure_request', jobId: undefined, body: `${d.order.orderNo} shipped${body.data.vehicle ? ` · ${body.data.vehicle}` : ''}` })
    })
    return { ok: true, shipped: true }
  })

  app.post('/:id/cancel', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const d = await prisma.dispatch.findUnique({ where: { id }, select: { status: true } })
    if (!d) return reply.code(404).send({ error: 'not_found' })
    if (d.status === 'shipped') return reply.code(409).send({ error: 'already_shipped' })
    await prisma.dispatch.update({ where: { id }, data: { status: 'cancelled' } })
    await writeAudit('dispatch', id, 'cancel', { actorId })
    return { ok: true }
  })
}
