import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { hashSecret } from '../lib/hash.js'

const ROLE = z.enum(['admin', 'ppc', 'dept_head', 'qc', 'fg_stock', 'maintenance'])
const PIN = z.string().regex(/^[0-9]{6}$/, '6-digit PIN')

// Admin-only user administration. Approval gate for self-signups.
export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  app.addHook('preHandler', requireRole('admin'))

  app.get('/', async (req) => {
    const q = z.object({ status: z.enum(['pending', 'active', 'suspended']).optional() }).parse(req.query)
    const users = await prisma.user.findMany({
      where: q.status ? { status: q.status } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        fullName: true,
        status: true,
        createdAt: true,
        roles: {
          select: { role: true, department: { select: { code: true, name: true } } },
        },
      },
    })
    return { users }
  })

  app.post('/:id/approve', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true, fullName: true } })
    if (!user) return reply.code(404).send({ error: 'not_found' })
    if (user.status === 'active') return { ok: true, alreadyActive: true }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'active' } })
      await tx.notification.create({
        data: { userId: id, type: 'ppc_approval', body: 'Your GRYNX account was approved — you can now sign in.' },
      })
      await writeAudit('user', id, 'approve', { actorId, before: { status: user.status }, after: { status: 'active' }, tx })
    })
    return { ok: true }
  })

  app.post('/:id/reject', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, status: true } })
    if (!user) return reply.code(404).send({ error: 'not_found' })

    await prisma.user.update({ where: { id }, data: { status: 'suspended' } })
    await writeAudit('user', id, 'reject', { actorId, before: { status: user.status }, after: { status: 'suspended' } })
    return { ok: true }
  })

  // ── admin creates a user directly (active, with a starting PIN + role) ──────
  app.post('/', async (req, reply) => {
    const body = z.object({ username: z.string().min(2).max(40), fullName: z.string().min(2).max(80), pin: PIN, role: ROLE, departmentId: z.string().uuid().optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const username = body.data.username.trim()
    if (await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } })) return reply.code(409).send({ error: 'username_taken' })
    const user = await prisma.user.create({
      data: { username, fullName: body.data.fullName, status: 'active', pinHash: await hashSecret(body.data.pin), roles: { create: { role: body.data.role, departmentId: body.data.departmentId ?? null } } },
      select: { id: true, username: true },
    })
    await writeAudit('user', user.id, 'create', { actorId, after: { username, role: body.data.role } })
    return reply.code(201).send({ user })
  })

  // ── reset a user's PIN ──────────────────────────────────────────────────────
  app.post('/:id/reset-pin', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ pin: PIN }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    await prisma.user.update({ where: { id }, data: { pinHash: await hashSecret(body.data.pin) } })
    await writeAudit('user', id, 'reset_pin', { actorId })
    return { ok: true }
  })

  // ── activate / suspend ──────────────────────────────────────────────────────
  app.post('/:id/status', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ status: z.enum(['active', 'suspended']) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    if (id === actorId) return reply.code(400).send({ error: 'cannot_change_self' })
    await prisma.user.update({ where: { id }, data: { status: body.data.status } })
    await writeAudit('user', id, 'set_status', { actorId, after: { status: body.data.status } })
    return { ok: true }
  })

  // ── replace a user's roles ──────────────────────────────────────────────────
  app.post('/:id/roles', async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ roles: z.array(z.object({ role: ROLE, departmentId: z.string().uuid().optional() })).min(1) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    await prisma.$transaction(async (tx) => {
      await tx.roleAssignment.deleteMany({ where: { userId: id } })
      await tx.roleAssignment.createMany({ data: body.data.roles.map((r) => ({ userId: id, role: r.role, departmentId: r.departmentId ?? null })) })
    })
    await writeAudit('user', id, 'set_roles', { actorId, after: { roles: body.data.roles.map((r) => r.role) } })
    return { ok: true }
  })
}
