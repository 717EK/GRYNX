import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req) => {
    const u = req.user as AccessPayload
    const q = z.object({ unread: z.coerce.boolean().optional() }).parse(req.query)
    const notifications = await prisma.notification.findMany({
      where: { userId: u.sub, ...(q.unread ? { readAt: null } : {}) },
      // unread first (so they never fall outside the window), newest first within
      orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      take: 100,
    })
    return { notifications }
  })

  app.get('/count', async (req) => {
    const u = req.user as AccessPayload
    const unread = await prisma.notification.count({ where: { userId: u.sub, readAt: null } })
    return { unread }
  })

  app.post('/:id/read', async (req) => {
    const u = req.user as AccessPayload
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    await prisma.notification.updateMany({ where: { id, userId: u.sub }, data: { readAt: new Date() } })
    return { ok: true }
  })

  app.post('/read-all', async (req) => {
    const u = req.user as AccessPayload
    await prisma.notification.updateMany({ where: { userId: u.sub, readAt: null }, data: { readAt: new Date() } })
    return { ok: true }
  })
}
