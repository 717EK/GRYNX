import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyAdmins } from '../lib/notify.js'
import { nextDailySequence } from '../lib/sequence.js'
import { createJobFromInput } from '../lib/jobCreate.js'
import { moveStock, normSize } from '../lib/stock.js'

// Order layer (docs/12 phase 3). A Sales Order holds line-items; PPC raises a Job
// per item that needs production (others are fulfilled from FG stock — phase 5).
// The order's production progress is DERIVED from its sub-jobs; whole-order
// completion = every item resolved (closed job or from-stock).

type OrderWithRollup = { items: { id: string; fromStock: boolean }[]; jobs: { orderItemId: string | null; status: string }[]; status: string }
function rollup(o: OrderWithRollup) {
  const resolved = o.items.filter((i) => i.fromStock || o.jobs.some((j) => j.orderItemId === i.id && j.status === 'closed')).length
  return {
    totalItems: o.items.length,
    fromStock: o.items.filter((i) => i.fromStock).length,
    totalJobs: o.jobs.length,
    closedJobs: o.jobs.filter((j) => j.status === 'closed').length,
    resolved,
  }
}
function derivedStatus(status: string, r: ReturnType<typeof rollup>) {
  if (['cancelled', 'on_hold', 'dispatched', 'closed'].includes(status)) return status
  if (r.totalItems > 0 && r.resolved === r.totalItems) return 'ready'
  if (r.totalJobs > 0) return 'in_production'
  return status === 'draft' ? 'draft' : 'planning'
}

const orderSelect = {
  id: true, orderNo: true, name: true, client: true, notes: true, priority: true, targetDate: true,
  status: true, createdById: true, createdAt: true,
  items: { select: { id: true, productId: true, modelId: true, size: true, quantity: true, fromStock: true, note: true, product: { select: { code: true, name: true } }, model: { select: { code: true, name: true } } } },
  jobs: { select: { id: true, displayLabel: true, name: true, status: true, orderItemId: true } },
} as const

export async function orderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // list (with derived production rollup)
  app.get('/', async (req) => {
    const q = z.object({ status: z.string().optional() }).parse(req.query)
    const rows = await prisma.order.findMany({
      where: q.status ? { status: q.status as never } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: orderSelect,
    })
    return { orders: rows.map((o) => { const r = rollup(o); return { ...o, rollup: r, derivedStatus: derivedStatus(o.status, r) } }) }
  })

  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const o = await prisma.order.findUnique({ where: { id }, select: orderSelect })
    if (!o) return reply.code(404).send({ error: 'not_found' })
    const r = rollup(o)
    return { order: { ...o, rollup: r, derivedStatus: derivedStatus(o.status, r) } }
  })

  // sales creates an order with line-items
  app.post('/', { preHandler: requireRole('admin', 'sales') }, async (req, reply) => {
    const body = z
      .object({
        client: z.string().min(1).max(120),
        name: z.string().max(120).optional(),
        notes: z.string().max(2000).optional(),
        priority: z.enum(['normal', 'urgent']).default('normal'),
        targetDate: z.coerce.date().optional(),
        submit: z.boolean().default(true),
        items: z.array(z.object({ productId: z.string().uuid(), modelId: z.string().uuid().optional(), size: z.string().max(20).optional(), quantity: z.number().int().positive(), note: z.string().max(200).optional() })).min(1),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const order = await prisma.$transaction(async (tx) => {
      const seq = await nextDailySequence(tx, 'order:counter')
      const o = await tx.order.create({
        data: {
          orderNo: `ORD-${String(seq).padStart(4, '0')}`,
          name: body.data.name ?? null,
          client: body.data.client,
          notes: body.data.notes ?? null,
          priority: body.data.priority,
          targetDate: body.data.targetDate ?? null,
          status: body.data.submit ? 'submitted' : 'draft',
          createdById: actorId,
          items: { create: body.data.items.map((i) => ({ productId: i.productId, modelId: i.modelId ?? null, size: i.size ?? null, quantity: i.quantity, note: i.note ?? null })) },
        },
        select: orderSelect,
      })
      if (o.status === 'submitted') await notifyAdmins(tx, { type: 'ppc_approval', entityId: o.id, body: `New order ${o.orderNo} from ${o.client}${o.name ? ` — ${o.name}` : ''} (${o.items.length} line${o.items.length > 1 ? 's' : ''})` })
      await writeAudit('order', o.id, 'create', { actorId, after: { orderNo: o.orderNo, items: o.items.length }, tx })
      return o
    }, { timeout: 20_000, maxWait: 5_000 })
    return reply.code(201).send({ order })
  })

  // update coarse status / fields (cancel, hold, etc.)
  app.patch('/:id', { preHandler: requireRole('admin', 'ppc', 'sales') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ status: z.enum(['draft', 'submitted', 'planning', 'cancelled', 'on_hold']).optional(), name: z.string().max(120).optional(), notes: z.string().max(2000).optional(), targetDate: z.coerce.date().optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return reply.code(404).send({ error: 'not_found' })
    const order = await prisma.order.update({ where: { id }, data: { ...body.data }, select: orderSelect })
    await writeAudit('order', id, 'update', { actorId, after: { status: order.status } })
    const r = rollup(order)
    return { order: { ...order, rollup: r, derivedStatus: derivedStatus(order.status, r) } }
  })

  // PPC marks an item fulfilled from existing FG stock → RESERVES the qty (phase 5).
  // Undo releases it. Reservation is optimistic-locked so two orders can't claim
  // the same units (R2).
  app.post('/:id/items/:itemId/from-stock', { preHandler: requireRole('admin', 'ppc') }, async (req, reply) => {
    const { id, itemId } = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).parse(req.params)
    const body = z.object({ fromStock: z.boolean().default(true) }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId: id }, select: { id: true, productId: true, modelId: true, size: true, quantity: true, fromStock: true, stockItemId: true } })
    if (!item) return reply.code(404).send({ error: 'not_found' })

    const modelId = item.modelId ?? (await prisma.model.findFirst({ where: { productId: item.productId, active: true }, select: { id: true } }))?.id
    if (!modelId) return reply.code(400).send({ error: 'no_model_for_item' })
    const key = { productId: item.productId, modelId, size: normSize(item.size) }

    if (body.fromStock && !item.fromStock) {
      const res = await moveStock({ key, kind: 'reserve', qty: item.quantity, actorId, orderId: id, orderItemId: itemId, note: 'reserved for order' })
      if (!res.ok) return reply.code(409).send({ error: res.error, available: res.available ?? 0 })
      await prisma.orderItem.update({ where: { id: itemId }, data: { fromStock: true, stockItemId: res.stockItemId } })
    } else if (!body.fromStock && item.fromStock) {
      await moveStock({ key, kind: 'release', qty: item.quantity, actorId, orderId: id, orderItemId: itemId, note: 'reservation released' })
      await prisma.orderItem.update({ where: { id: itemId }, data: { fromStock: false, stockItemId: null } })
    }
    return { ok: true, fromStock: body.fromStock }
  })

  // PPC raises a JOB for an order line-item (links it back to the order)
  app.post('/:id/items/:itemId/job', { preHandler: requireRole('admin', 'ppc') }, async (req, reply) => {
    const { id, itemId } = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).parse(req.params)
    const body = z.object({ name: z.string().max(120).optional(), startDate: z.coerce.date().optional() }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const order = await prisma.order.findUnique({ where: { id }, select: { orderNo: true, name: true, client: true, priority: true } })
    const item = await prisma.orderItem.findFirst({ where: { id: itemId, orderId: id }, select: { id: true, productId: true, modelId: true, size: true, quantity: true, product: { select: { code: true } } } })
    if (!order || !item) return reply.code(404).send({ error: 'not_found' })

    // resolve a model: explicit on the item, else the product's first active model
    let modelId = item.modelId
    if (!modelId) modelId = (await prisma.model.findFirst({ where: { productId: item.productId, active: true }, select: { id: true } }))?.id ?? null
    if (!modelId) return reply.code(400).send({ error: 'no_model_for_item' })

    const result = await createJobFromInput(
      {
        productId: item.productId,
        name: body.data.name ?? order.name ?? `${order.client} · ${item.product.code}`,
        priority: order.priority,
        startDate: body.data.startDate ?? null,
        orderId: id,
        orderItemId: itemId,
        models: [{ modelId, size: item.size, quantity: item.quantity }],
      },
      { actorId, source: 'admin' },
    )
    if (!result.ok) return reply.code(result.status).send({ error: result.error })
    // bump the order into production
    await prisma.order.update({ where: { id }, data: { status: 'in_production' } })
    await writeAudit('order', id, 'raise_job', { actorId, after: { jobId: result.job.id, itemId } })
    return reply.code(201).send({ job: { id: result.job.id, displayLabel: result.job.displayLabel } })
  })
}
