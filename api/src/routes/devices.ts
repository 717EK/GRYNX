import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'

export async function deviceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Register (or refresh) this device's FCM token against the signed-in user.
  app.post('/register', async (req, reply) => {
    const body = z.object({ token: z.string().min(20).max(4096), platform: z.string().max(20).default('android') }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const userId = (req.user as AccessPayload).sub
    // a token belongs to exactly one user — rebind on upsert
    await prisma.pushToken.upsert({
      where: { token: body.data.token },
      create: { token: body.data.token, platform: body.data.platform, userId },
      update: { userId, platform: body.data.platform, lastSeenAt: new Date() },
    })
    return { ok: true }
  })

  // Drop this device's token (call on sign-out to stop pushes to it).
  app.post('/unregister', async (req, reply) => {
    const body = z.object({ token: z.string().min(20).max(4096) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    await prisma.pushToken.deleteMany({ where: { token: body.data.token } })
    return { ok: true }
  })
}
