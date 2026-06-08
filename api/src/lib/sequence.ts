import type { Prisma } from '@prisma/client'

// Atomic per-scope daily counter. The upsert+increment runs inside the job
// creation transaction so two concurrent creations can't hand out the same
// sequence — the row is locked for the duration of the increment.
export async function nextDailySequence(tx: Prisma.TransactionClient, scope: string) {
  const row = await tx.dailySequence.upsert({
    where: { scope },
    update: { lastValue: { increment: 1 } },
    create: { scope, lastValue: 1 },
  })
  return row.lastValue
}
