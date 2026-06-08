import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

const app = Fastify({ logger: true })

await app.register(cors, {
  origin: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  credentials: true,
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret',
})

// liveness / readiness — also proves the DB connection
app.get('/health', async () => {
  await prisma.$queryRaw`SELECT 1`
  return { ok: true, service: 'grynx-api', time: new Date().toISOString() }
})

// ── routes are mounted here as they are built ───────────────────────────────
// app.register(authRoutes,  { prefix: '/api/v1/auth' })
// app.register(jobRoutes,   { prefix: '/api/v1/jobs' })
// app.register(scanRoutes,  { prefix: '/api/v1/scan' })   // the state-machine engine (docs/10)
// app.register(deptRoutes,  { prefix: '/api/v1/departments' })

const port = Number(process.env.PORT ?? 4000)
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => app.log.info(`GRYNX API on :${port}`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
