import type { FastifyReply, FastifyRequest } from 'fastify'
import type { Role } from '@prisma/client'

// What we put inside the signed access token. Roles are embedded so the common
// path needs no DB hit; they're re-read on sensitive mutations where staleness
// would matter. `typ` separates access from refresh tokens.
export interface AccessPayload {
  sub: string
  username: string
  roles: { role: Role; departmentId: string | null }[]
  typ: 'access'
}

export interface RefreshPayload {
  sub: string
  typ: 'refresh'
}

// @fastify/jwt stores the verified payload on request.user. Type it as the
// access payload — that's what every authenticated route sees.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessPayload | RefreshPayload
    user: AccessPayload
  }
}

export const ACCESS_TTL = '12h' // floor shifts; office sessions
export const REFRESH_TTL = '30d' // long-lived floor devices

/** preHandler: rejects anything without a valid *access* token. */
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.code(401).send({ error: 'unauthorized' })
  }
  if ((req.user as AccessPayload).typ !== 'access') {
    return reply.code(401).send({ error: 'invalid_token_type' })
  }
}

export const isAdmin = (u: AccessPayload) => u.roles.some((r) => r.role === 'admin')

/** True if the user holds `role`, optionally scoped to a department. */
export function hasRole(u: AccessPayload, role: Role, departmentId?: string) {
  return u.roles.some(
    (r) => r.role === role && (departmentId === undefined || r.departmentId === departmentId),
  )
}

/** preHandler factory: require any one of the listed global roles. */
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const u = req.user as AccessPayload
    if (!roles.some((role) => u.roles.some((r) => r.role === role))) {
      return reply.code(403).send({ error: 'forbidden', need: roles })
    }
  }
}
