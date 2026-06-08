import { randomBytes } from 'node:crypto'
import type { Priority } from '@prisma/client'

// Human display label (D9): AT-U-045-060626-001. Regenerable from job fields;
// the barcode never encodes this — it encodes the opaque jobNo. Must match the
// prototype JobForm scheme exactly.
export const pad2 = (n: number) => String(n).padStart(2, '0')
export const pad3 = (n: number) => String(n).padStart(3, '0')
export const ddmmyy = (d: Date) => `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}`
export const priorityCode = (p: Priority) => (p === 'urgent' ? 'U' : 'N')

export function buildDisplayLabel(
  productCode: string,
  priority: Priority,
  totalQty: number,
  date: Date,
  seq: number,
) {
  return `${productCode}-${priorityCode(priority)}-${pad3(totalQty)}-${ddmmyy(date)}-${pad3(seq)}`
}

// Daily-sequence scope key. Resets per product per calendar day (local date).
export const dailyScope = (productCode: string, date: Date) =>
  `job:${productCode}:${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`

// Opaque, immutable internal key the barcode encodes. Crockford base32 (no
// I/L/O/U → scanner-safe), prefixed J. @unique on the column catches the rare
// collision; the caller retries.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function opaqueJobNo() {
  let s = 'J'
  for (const b of randomBytes(11)) s += ALPHABET[b % 32]
  return s
}
