import { Prisma, type StockMoveKind } from '@prisma/client'
import { prisma } from './prisma.js'

// FG inventory engine (docs/12 phase 5). The ONE rule that prevents shipping the
// same truss to two clients (R2): every change to a StockItem is an optimistic-
// locked read-modify-write with retry. available = onHand − reserved.
//
// Buckets are keyed by product+model+size. modelId is always concrete (callers
// resolve a real model); size is coerced to '' when absent — so the unique index
// never sees NULLs (Postgres treats NULLs as distinct, which would split buckets).

export interface StockKey { productId: string; modelId: string; size: string }

export function normSize(s?: string | null) { return (s ?? '').trim() }

async function ensureItem(key: StockKey) {
  const where = { productId_modelId_size: { productId: key.productId, modelId: key.modelId, size: key.size } }
  const found = await prisma.stockItem.findUnique({ where })
  if (found) return found
  try {
    return await prisma.stockItem.create({ data: { productId: key.productId, modelId: key.modelId, size: key.size } })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await prisma.stockItem.findUnique({ where })
      if (again) return again
    }
    throw e
  }
}

export async function getAvailable(key: StockKey): Promise<{ stockItemId: string | null; onHand: number; reserved: number; available: number }> {
  const where = { productId_modelId_size: { productId: key.productId, modelId: key.modelId, size: key.size } }
  const item = await prisma.stockItem.findUnique({ where })
  if (!item) return { stockItemId: null, onHand: 0, reserved: 0, available: 0 }
  return { stockItemId: item.id, onHand: item.onHand, reserved: item.reserved, available: item.onHand - item.reserved }
}

type MoveResult =
  | { ok: true; stockItemId: string; onHand: number; reserved: number; available: number }
  | { ok: false; error: 'insufficient_stock' | 'below_reserved' | 'lock_contention'; available?: number }

export async function moveStock(args: {
  key: StockKey
  kind: StockMoveKind
  qty: number // units (always positive)
  actorId: string
  setOnHand?: number // for opening/adjust: absolute on-hand instead of delta
  orderId?: string | null
  orderItemId?: string | null
  jobId?: string | null
  clientTag?: string | null
  note?: string | null
}): Promise<MoveResult> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const item = await ensureItem(args.key)
    const cur = await prisma.stockItem.findUnique({ where: { id: item.id } })
    if (!cur) continue
    let onHand = cur.onHand
    let reserved = cur.reserved
    const available = cur.onHand - cur.reserved

    switch (args.kind) {
      case 'opening':
      case 'adjust':
        onHand = args.setOnHand !== undefined ? args.setOnHand : cur.onHand + args.qty
        if (onHand < cur.reserved) return { ok: false, error: 'below_reserved' } // can't drop below committed
        break
      case 'produced':
        onHand = cur.onHand + args.qty
        break
      case 'reserve':
        if (available < args.qty) return { ok: false, error: 'insufficient_stock', available }
        reserved = cur.reserved + args.qty
        break
      case 'release':
        reserved = Math.max(0, cur.reserved - args.qty)
        break
      case 'dispatch':
        onHand = Math.max(0, cur.onHand - args.qty)
        reserved = Math.max(0, cur.reserved - args.qty)
        break
    }
    if (onHand < 0) onHand = 0

    try {
      await prisma.$transaction(
        async (tx) => {
          const r = await tx.stockItem.updateMany({ where: { id: item.id, version: cur.version }, data: { onHand, reserved, version: { increment: 1 } } })
          if (r.count !== 1) throw new ConflictError() // another writer won — retry
          await tx.stockMovement.create({
            data: { stockItemId: item.id, kind: args.kind, qty: args.qty, onHandAfter: onHand, reservedAfter: reserved, orderId: args.orderId ?? null, orderItemId: args.orderItemId ?? null, jobId: args.jobId ?? null, clientTag: args.clientTag ?? null, actorId: args.actorId, note: args.note ?? null },
          })
        },
        { timeout: 15_000, maxWait: 5_000 },
      )
      return { ok: true, stockItemId: item.id, onHand, reserved, available: onHand - reserved }
    } catch (e) {
      if (e instanceof ConflictError) continue // optimistic-lock miss → re-read and retry
      throw e
    }
  }
  return { ok: false, error: 'lock_contention' }
}

class ConflictError extends Error {}
