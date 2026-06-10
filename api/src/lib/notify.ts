import type { Prisma, PrismaClient, NotificationType } from '@prisma/client'
import { prisma } from './prisma.js'
import { sendPush } from './fcm.js'

type Db = Prisma.TransactionClient | PrismaClient

const PUSH_TITLE: Record<string, string> = {
  new_job: 'New job', update_request: 'Update requested', hold_alert: 'Job on hold',
  ppc_approval: 'PPC', maintenance_alert: 'Maintenance', closure_request: 'Closure', escalation: 'Escalation',
}

// Fire FCM push to a set of users — fire-and-forget so it never blocks/extends a
// DB transaction. Uses the global client (independent of any tx). Prunes dead
// tokens. No-op when FCM isn't configured.
function pushToUsers(userIds: string[], type: NotificationType, body: string, extra?: Record<string, string>) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return
  void (async () => {
    try {
      const rows = await prisma.pushToken.findMany({ where: { userId: { in: ids } }, select: { token: true } })
      const tokens = rows.map((r) => r.token)
      if (tokens.length === 0) return
      const dead = await sendPush(tokens, { title: PUSH_TITLE[type] ?? 'GRYNX', body, data: { type, ...(extra ?? {}) } })
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } })
    } catch {
      /* push is best-effort */
    }
  })()
}

// V1 recipients = a department's heads + backups (docs/01 §notifications).
// Admin is added only on escalation, handled separately by the escalation timer.
export async function notifyDepartment(
  tx: Prisma.TransactionClient,
  departmentId: string,
  payload: { type: NotificationType; body: string; jobId?: string; ticketId?: string },
) {
  const heads = await tx.roleAssignment.findMany({
    where: { role: 'dept_head', departmentId },
    select: { userId: true },
  })
  if (heads.length === 0) return
  await tx.notification.createMany({
    data: heads.map((h) => ({
      userId: h.userId,
      type: payload.type,
      body: payload.body,
      jobId: payload.jobId ?? null,
      ticketId: payload.ticketId ?? null,
    })),
  })
  pushToUsers(heads.map((h) => h.userId), payload.type, payload.body, payload.jobId ? { jobId: payload.jobId } : undefined)
}

/** Notify the whole maintenance crew (everyone with the maintenance role). */
export async function notifyMaintenanceCrew(
  tx: Prisma.TransactionClient,
  payload: { type: NotificationType; body: string; ticketId?: string },
) {
  const crew = await tx.roleAssignment.findMany({
    where: { role: 'maintenance' },
    select: { userId: true },
  })
  const ids = [...new Set(crew.map((c) => c.userId))]
  if (ids.length === 0) return
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: payload.type, body: payload.body, ticketId: payload.ticketId ?? null })),
  })
  pushToUsers(ids, payload.type, payload.body, payload.ticketId ? { ticketId: payload.ticketId } : undefined)
}

/** Notify every admin (e.g. a new PPC request to review). entityId links the
 *  notification to its source (e.g. the PPC request) so a tap opens it directly. */
export async function notifyAdmins(tx: Db, payload: { type: NotificationType; body: string; jobId?: string; entityId?: string }) {
  const admins = await tx.roleAssignment.findMany({ where: { role: 'admin' }, select: { userId: true } })
  const ids = [...new Set(admins.map((a) => a.userId))]
  if (ids.length === 0) return
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: payload.type, body: payload.body, jobId: payload.jobId ?? null, entityId: payload.entityId ?? null })),
  })
  pushToUsers(ids, payload.type, payload.body, payload.entityId ? { entityId: payload.entityId } : payload.jobId ? { jobId: payload.jobId } : undefined)
}

/** Notify specific users (e.g. the assignee, or the reporter on close). */
export async function notifyUsers(
  tx: Db,
  userIds: string[],
  payload: { type: NotificationType; body: string; ticketId?: string; jobId?: string; entityId?: string },
) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: payload.type, body: payload.body, ticketId: payload.ticketId ?? null, jobId: payload.jobId ?? null, entityId: payload.entityId ?? null })),
  })
  pushToUsers(ids, payload.type, payload.body, payload.entityId ? { entityId: payload.entityId } : payload.jobId ? { jobId: payload.jobId } : payload.ticketId ? { ticketId: payload.ticketId } : undefined)
}
