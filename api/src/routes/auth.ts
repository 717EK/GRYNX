import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { verifySecret } from '../lib/hash.js'
import { authenticate, ACCESS_TTL, REFRESH_TTL, type AccessPayload, type RefreshPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { hashSecret } from '../lib/hash.js'

// Phone number used as the user ID for self-signup. Keep validation loose
// (formats vary); store digits + optional leading +.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 \-]{6,18}$/, 'enter a valid phone number')
  .transform((s) => s.replace(/[\s-]/g, ''))

const signupSchema = z.object({
  phone: phoneSchema,
  fullName: z.string().trim().min(2).max(80),
  departmentId: z.string().uuid(),
  pin: z.string().regex(/^[0-9]{6}$/, '6-digit PIN'),
})

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

export async function loadRoles(userId: string) {
  const rows = await prisma.roleAssignment.findMany({
    where: { userId },
    select: { role: true, departmentId: true },
  })
  return rows.map((r) => ({ role: r.role, departmentId: r.departmentId }))
}

// Mint the access + refresh tokens and the session body. Shared by PIN/password
// login and biometric (WebAuthn) login so both paths issue identical sessions.
export async function issueSession(
  reply: import('fastify').FastifyReply,
  user: { id: string; username: string; fullName: string },
  method: string,
) {
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
  await writeAudit('user', user.id, 'login', { actorId: user.id, after: { method } })
  return { accessToken, refreshToken, user: { id: user.id, username: user.username, fullName: user.fullName, roles } }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const { pin, password } = parsed.data
    // Username is case-insensitive: 'aashish' / 'AASHISH' / 'Aashish' all match.
    // Throttle on the normalised key so case can't be used to dodge the limit.
    const username = parsed.data.username.trim()
    const throttleKey = username.toUpperCase()

    const waitMs = lockState(throttleKey)
    if (waitMs > 0) {
      return reply.code(429).send({ error: 'too_many_attempts', retryAfterMs: waitMs })
    }

    const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } } })
    // Always run a verify to keep timing roughly constant whether or not the
    // user exists (avoids username enumeration via response time).
    const hash = pin ? user?.pinHash : user?.passwordHash
    // Verify the secret regardless of status (constant-time-ish); decide on
    // status only AFTER a correct PIN so a pending/suspended state is never
    // revealed to someone who doesn't know the PIN (no enumeration).
    const ok =
      !!user && !!hash
        ? await verifySecret(hash, (pin ?? password)!)
        : await verifySecret('$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'x').then(() => false)

    if (!ok || !user) {
      recordFail(throttleKey)
      return reply.code(401).send({ error: 'invalid_credentials' })
    }
    clearFails(throttleKey)

    if (user.status !== 'active') {
      return reply.code(403).send({ error: user.status === 'pending' ? 'account_pending' : 'account_suspended' })
    }

    return reply.send(await issueSession(reply, user, pin ? 'pin' : 'password'))
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

  // Public department list for the signup form (no auth — only id/code/name).
  app.get('/departments', async () => {
    const departments = await prisma.department.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true },
    })
    return { departments }
  })

  // Self-service signup: phone = user ID. Lands as `pending` until an admin
  // approves (see users routes). Assigned a department-bound dept_head role so
  // they can scan their station once activated; the admin can refine the role.
  app.post('/signup', async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const { phone, fullName, departmentId, pin } = parsed.data

    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } })
    if (!dept) return reply.code(400).send({ error: 'invalid_department' })

    const existing = await prisma.user.findUnique({ where: { username: phone }, select: { id: true } })
    if (existing) return reply.code(409).send({ error: 'phone_already_registered' })

    const pinHash = await hashSecret(pin)
    const user = await prisma.user.create({
      data: {
        username: phone,
        fullName,
        pinHash,
        status: 'pending',
        roles: { create: { role: 'dept_head', departmentId } },
      },
      select: { id: true, username: true, fullName: true, status: true },
    })
    await writeAudit('user', user.id, 'signup', { actorId: user.id, after: { phone, departmentId } })
    return reply.code(201).send({ user, message: 'Account created — awaiting admin approval' })
  })
}
