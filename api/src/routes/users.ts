import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'

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
}
