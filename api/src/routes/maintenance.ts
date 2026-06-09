import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyMaintenanceCrew, notifyUsers } from '../lib/notify.js'
import { nextDailySequence } from '../lib/sequence.js'

const CATEGORIES = ['electrical', 'mechanical', 'utility', 'facility', 'it_network', 'safety', 'other'] as const
const PRIORITIES = ['critical', 'high', 'normal', 'low'] as const

const raiseSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES).default('normal'),
  locationText: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
})

const ticketDetail = {
  id: true,
  ticketNo: true,
  category: true,
  priority: true,
  status: true,
  locationText: true,
  description: true,
  etaHours: true,
  partsNeeded: true,
  closeRemark: true,
  reportedById: true,
  assignedToId: true,
  createdAt: true,
  updatedAt: true,
} as const

const userBrief = { id: true, fullName: true, username: true }

// MaintenanceTicket stores actor IDs as scalars (no FK relations), so resolve
// names in code.
async function usersById(ids: (string | null | undefined)[]) {
  const want = [...new Set(ids.filter((x): x is string => !!x))]
  if (want.length === 0) return {} as Record<string, { id: string; fullName: string; username: string }>
  const rows = await prisma.user.findMany({ where: { id: { in: want } }, select: userBrief })
  return Object.fromEntries(rows.map((u) => [u.id, u]))
}

export async function maintenanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // ── raise a ticket (anyone authenticated) ──────────────────────────────────
  app.post('/', async (req, reply) => {
    const parsed = raiseSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const input = parsed.data

    const ticket = await prisma.$transaction(async (tx) => {
      const seq = await nextDailySequence(tx, 'maint:counter')
      const t = await tx.maintenanceTicket.create({
        data: {
          ticketNo: `MT-${String(seq).padStart(4, '0')}`,
          category: input.category,
          priority: input.priority,
          locationText: input.locationText,
          description: input.description,
          reportedById: actorId,
          events: { create: { type: 'created', actorId, body: input.description } },
        },
        select: ticketDetail,
      })
      await writeAudit('maintenance', t.id, 'create', { actorId, after: { ticketNo: t.ticketNo, priority: t.priority }, tx })
      await notifyMaintenanceCrew(tx, {
        type: 'maintenance_alert',
        ticketId: t.id,
        body: `${t.priority.toUpperCase()} · ${t.ticketNo} @ ${input.locationText}`,
      })
      return t
    })
    return reply.code(201).send({ ticket })
  })

  // ── list (filter by status / mine / assigned) ──────────────────────────────
  app.get('/', async (req) => {
    const q = z
      .object({ status: z.enum(['open', 'assigned', 'in_progress', 'completed', 'verified', 'closed']).optional() })
      .parse(req.query)
    const rows = await prisma.maintenanceTicket.findMany({
      where: q.status ? { status: q.status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: { ...ticketDetail, _count: { select: { events: true } } },
    })
    const byId = await usersById(rows.map((t) => t.assignedToId))
    const tickets = rows.map((t) => ({ ...t, assignedTo: t.assignedToId ? byId[t.assignedToId] ?? null : null }))
    return { tickets }
  })

  // ── maintenance crew (for the assign picker) ───────────────────────────────
  app.get('/crew', { preHandler: requireRole('admin', 'maintenance') }, async () => {
    const rows = await prisma.roleAssignment.findMany({
      where: { role: 'maintenance' },
      select: { user: { select: userBrief } },
    })
    const seen = new Set<string>()
    const crew = rows
      .map((r) => r.user)
      .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
    return { crew }
  })

  // ── detail + thread ─────────────────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const row = await prisma.maintenanceTicket.findUnique({
      where: { id },
      select: { ...ticketDetail, events: { orderBy: { createdAt: 'asc' } } },
    })
    if (!row) return reply.code(404).send({ error: 'not_found' })
    const byId = await usersById([row.reportedById, row.assignedToId])
    return {
      ticket: {
        ...row,
        reportedBy: byId[row.reportedById] ?? null,
        assignedTo: row.assignedToId ? byId[row.assignedToId] ?? null : null,
      },
    }
  })

  // ── assign (maintenance head / admin) ──────────────────────────────────────
  app.post('/:id/assign', { preHandler: requireRole('admin', 'maintenance') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ assignedToId: z.string().uuid() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub

    const assignee = await prisma.user.findUnique({ where: { id: body.data.assignedToId }, select: { id: true, fullName: true } })
    if (!assignee) return reply.code(404).send({ error: 'assignee_not_found' })

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.maintenanceTicket.update({
        where: { id },
        data: {
          assignedToId: assignee.id,
          status: 'assigned',
          events: { create: { type: 'assigned', actorId, body: assignee.fullName } },
        },
        select: ticketDetail,
      })
      await writeAudit('maintenance', id, 'assign', { actorId, after: { assignedToId: assignee.id }, tx })
      await notifyUsers(tx, [assignee.id], { type: 'maintenance_alert', ticketId: id, body: `Assigned to you: ${t.ticketNo}` })
      return t
    })
    return { ticket }
  })

  // ── update / post to the thread (assignee, maintenance, admin) ──────────────
  app.post('/:id/update', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z
      .object({
        note: z.string().max(1000).optional(),
        etaHours: z.number().int().min(0).max(2000).nullable().optional(),
        partsNeeded: z.string().max(500).nullable().optional(),
        status: z.enum(['in_progress', 'completed']).optional(),
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const u = req.user as AccessPayload

    const existing = await prisma.maintenanceTicket.findUnique({ where: { id }, select: { assignedToId: true, status: true } })
    if (!existing) return reply.code(404).send({ error: 'not_found' })
    const isMaint = u.roles.some((r) => r.role === 'maintenance' || r.role === 'admin')
    if (!isMaint && existing.assignedToId !== u.sub) return reply.code(403).send({ error: 'forbidden' })

    const { note, etaHours, partsNeeded, status } = body.data
    const threadBody =
      note ??
      ([etaHours != null ? `ETA ${etaHours}h` : null, partsNeeded ? `parts: ${partsNeeded}` : null, status ? `→ ${status}` : null]
        .filter(Boolean)
        .join(' · ') || 'update')

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.maintenanceTicket.update({
        where: { id },
        data: {
          ...(etaHours !== undefined ? { etaHours } : {}),
          ...(partsNeeded !== undefined ? { partsNeeded } : {}),
          ...(status ? { status } : existing.status === 'assigned' ? { status: 'in_progress' } : {}),
          events: { create: { type: 'update', actorId: u.sub, body: threadBody } },
        },
        select: ticketDetail,
      })
      await writeAudit('maintenance', id, 'update', { actorId: u.sub, after: { etaHours, partsNeeded, status }, tx })
      return t
    })
    return { ticket }
  })

  // ── close with remark (maintenance head / admin) ───────────────────────────
  app.post('/:id/close', { preHandler: requireRole('admin', 'maintenance') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ remark: z.string().min(1).max(1000) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: 'remark required' })
    const actorId = (req.user as AccessPayload).sub

    const existing = await prisma.maintenanceTicket.findUnique({ where: { id }, select: { reportedById: true, status: true } })
    if (!existing) return reply.code(404).send({ error: 'not_found' })
    if (existing.status === 'closed') return { ok: true, already: true }

    const ticket = await prisma.$transaction(async (tx) => {
      const t = await tx.maintenanceTicket.update({
        where: { id },
        data: {
          status: 'closed',
          closedById: actorId,
          closeRemark: body.data.remark,
          events: { create: { type: 'closed', actorId, body: body.data.remark } },
        },
        select: ticketDetail,
      })
      await writeAudit('maintenance', id, 'close', { actorId, after: { status: 'closed' }, tx })
      await notifyUsers(tx, [existing.reportedById], { type: 'maintenance_alert', ticketId: id, body: `${t.ticketNo} resolved & closed` })
      return t
    })
    return { ticket }
  })
}
