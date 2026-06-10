import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { prisma } from './lib/prisma.js'
import { authRoutes } from './routes/auth.js'
import { webauthnRoutes } from './routes/webauthn.js'
import { deviceRoutes } from './routes/devices.js'
import { startEscalationSweep } from './lib/escalation.js'
import { catalogueRoutes } from './routes/catalogue.js'
import { jobRoutes } from './routes/jobs.js'
import { scanRoutes } from './routes/scan.js'
import { userRoutes } from './routes/users.js'
import { maintenanceRoutes } from './routes/maintenance.js'
import { ppcRoutes } from './routes/ppc.js'
import { notificationRoutes } from './routes/notifications.js'
import { qcRoutes } from './routes/qc.js'
import { fgRoutes } from './routes/fg.js'
import { purchaseRoutes } from './routes/purchase.js'

const app = Fastify({ logger: true })

// CORS_ORIGINS is a comma list; entries may use a wildcard, e.g.
// "https://grynx.vercel.app,https://*.vercel.app" so Vercel preview deploys work.
const allowedOrigins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
function originAllowed(origin?: string) {
  if (!origin) return true // same-origin / curl / native app (no Origin header)
  return allowedOrigins.some((a) => {
    if (a === origin) return true
    if (a.includes('*')) {
      const re = new RegExp('^' + a.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$')
      return re.test(origin)
    }
    return false
  })
}
await app.register(cors, {
  origin: (origin, cb) => cb(null, originAllowed(origin)),
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

// ── routes ──────────────────────────────────────────────────────────────────
await app.register(authRoutes, { prefix: '/api/v1/auth' })
await app.register(webauthnRoutes, { prefix: '/api/v1/auth/webauthn' })
await app.register(deviceRoutes, { prefix: '/api/v1/devices' })
await app.register(catalogueRoutes, { prefix: '/api/v1' })
await app.register(jobRoutes, { prefix: '/api/v1/jobs' })
await app.register(scanRoutes, { prefix: '/api/v1/scan' }) // state-machine engine (docs/10)
await app.register(userRoutes, { prefix: '/api/v1/users' }) // admin: approve signups
await app.register(maintenanceRoutes, { prefix: '/api/v1/maintenance' })
await app.register(ppcRoutes, { prefix: '/api/v1/ppc' })
await app.register(notificationRoutes, { prefix: '/api/v1/notifications' })
await app.register(qcRoutes, { prefix: '/api/v1/qc' })
await app.register(fgRoutes, { prefix: '/api/v1/fg' })
await app.register(purchaseRoutes, { prefix: '/api/v1/purchase' })

const port = Number(process.env.PORT ?? 4000)
app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    app.log.info(`GRYNX API on :${port}`)
    startEscalationSweep() // aggressive maintenance: re-notify/escalate stale tickets
  })
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
