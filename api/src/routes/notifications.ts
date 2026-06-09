import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'

export async function notificationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/', async (req) => {
    const u = req.user as AccessPayload
    const notifications = await prisma.notification.findMany({
      where: { userId: u.sub },
      orderBy: { createdAt: 'desc' },
      take: 60,
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
