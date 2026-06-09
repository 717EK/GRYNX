import type { Prisma, PrismaClient, NotificationType } from '@prisma/client'

type Db = Prisma.TransactionClient | PrismaClient

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
}

/** Notify every admin (e.g. a new PPC request to review). */
export async function notifyAdmins(tx: Db, payload: { type: NotificationType; body: string; jobId?: string }) {
  const admins = await tx.roleAssignment.findMany({ where: { role: 'admin' }, select: { userId: true } })
  const ids = [...new Set(admins.map((a) => a.userId))]
  if (ids.length === 0) return
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: payload.type, body: payload.body, jobId: payload.jobId ?? null })),
  })
}

/** Notify specific users (e.g. the assignee, or the reporter on close). */
export async function notifyUsers(
  tx: Db,
  userIds: string[],
  payload: { type: NotificationType; body: string; ticketId?: string; jobId?: string },
) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (ids.length === 0) return
  await tx.notification.createMany({
    data: ids.map((userId) => ({ userId, type: payload.type, body: payload.body, ticketId: payload.ticketId ?? null, jobId: payload.jobId ?? null })),
  })
}
