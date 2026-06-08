import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { verifySecret } from '../lib/hash.js'
import { authenticate, ACCESS_TTL, REFRESH_TTL, type AccessPayload, type RefreshPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'

const loginSchema = z
  .object({
    username: z.string().min(1).max(64),
    pin: z.string().min(4).max(12).optional(),
    password: z.string().min(1).max(128).optional(),
  })
  .refine((b) => b.pin || b.password, { message: 'pin or password required' })

// Lightweight in-memory brute-force throttle. A 6-digit PIN is low entropy, so
// without this the login is trivially guessable. Per-username sliding window.
// NOTE: in-memory = single-instance + resets on restart; fine for the single-VM
// pilot, replace with a shared store (Redis) before scaling out. (worry §)
const FAILS = new Map<string, { n: number; until: number }>()
const MAX_FAILS = 6
const LOCK_MS = 60_000

function lockState(key: string) {
  const e = FAILS.get(key)
  if (e && e.until > Date.now()) return e.until - Date.now()
  return 0
}
function recordFail(key: string) {
  const e = FAILS.get(key) ?? { n: 0, until: 0 }
  e.n += 1
  if (e.n >= MAX_FAILS) {
    e.until = Date.now() + LOCK_MS
    e.n = 0
  }
  FAILS.set(key, e)
}
const clearFails = (key: string) => FAILS.delete(key)

async function loadRoles(userId: string) {
  const rows = await prisma.roleAssignment.findMany({
    where: { userId },
    select: { role: true, departmentId: true },
  })
  return rows.map((r) => ({ role: r.role, departmentId: r.departmentId }))
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const { username, pin, password } = parsed.data

    const waitMs = lockState(username)
    if (waitMs > 0) {
      return reply.code(429).send({ error: 'too_many_attempts', retryAfterMs: waitMs })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    // Always run a verify to keep timing roughly constant whether or not the
    // user exists (avoids username enumeration via response time).
    const hash = pin ? user?.pinHash : user?.passwordHash
    const ok =
      !!user && user.status === 'active' && !!hash
        ? await verifySecret(hash, (pin ?? password)!)
        : await verifySecret('$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'x').then(() => false)

    if (!ok || !user) {
      recordFail(username)
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    clearFails(username)

    const roles = await loadRoles(user.id)
    const accessToken = await reply.jwtSign(
      { sub: user.id, username: user.username, roles, typ: 'access' } satisfies AccessPayload,
      { expiresIn: ACCESS_TTL },
    )
    const refreshToken = await reply.jwtSign(
      { sub: user.id, typ: 'refresh' } satisfies RefreshPayload,
      { expiresIn: REFRESH_TTL },
    )

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    await writeAudit('user', user.id, 'login', { actorId: user.id, after: { method: pin ? 'pin' : 'password' } })

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, fullName: user.fullName, roles },
    }
  })

  app.post('/refresh', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().min(10) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    let payload: RefreshPayload
    try {
      payload = app.jwt.verify<RefreshPayload>(body.data.refreshToken)
    } catch {
      return reply.code(401).send({ error: 'invalid_refresh' })
    }
    if (payload.typ !== 'refresh') return reply.code(401).send({ error: 'invalid_token_type' })

    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.status !== 'active') return reply.code(401).send({ error: 'inactive' })

    const roles = await loadRoles(user.id) // re-read fresh, roles may have changed
    const accessToken = await reply.jwtSign(
      { sub: user.id, username: user.username, roles, typ: 'access' } satisfies AccessPayload,
      { expiresIn: ACCESS_TTL },
    )
    return { accessToken }
  })

  app.get('/me', { preHandler: authenticate }, async (req) => {
    const u = req.user as AccessPayload
    const user = await prisma.user.findUnique({
      where: { id: u.sub },
      select: { id: true, username: true, fullName: true, status: true },
    })
    return { user: { ...user, roles: u.roles } }
  })
}
