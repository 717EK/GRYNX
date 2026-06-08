import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma.js'

// Every mutation writes one audit row (docs/09 hard rule). Pass a transaction
// client (`tx`) when the audit must be atomic with the change — the scan engine
// does this so a committed advance always has its audit row, and a rolled-back
// one leaves nothing behind.
export function writeAudit(
  entity: string,
  entityId: string,
  action: string,
  opts: {
    actorId?: string | null
    before?: unknown
    after?: unknown
    tx?: Prisma.TransactionClient | PrismaClient
  } = {},
) {
  const db = opts.tx ?? prisma
  return db.auditLog.create({
    data: {
      entity,
      entityId,
      action,
      actorId: opts.actorId ?? null,
      before: (opts.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (opts.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}
