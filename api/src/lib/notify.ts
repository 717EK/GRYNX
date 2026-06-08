import type { Prisma, NotificationType } from '@prisma/client'

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
