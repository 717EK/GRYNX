import { prisma } from './prisma.js'

// Size-scaled station SLA (docs/10 exception detection), mirrors src/lib/insights.ts:
//   stationSlaHours(qty) = clamp(base + floor(qty / qtyPerHour), max)
// Config lives in the `settings` table so admins can tune it without a deploy.
type SlaCfg = { base: number; perHour: number; max: number; unaccepted: number }
let cache: { cfg: SlaCfg; at: number } | null = null
const TTL = 30_000

async function cfg(): Promise<SlaCfg> {
  if (cache && Date.now() - cache.at < TTL) return cache.cfg
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['sla.baseHours', 'sla.qtyPerHour', 'sla.maxHours', 'escalation.unacceptedHours'] } },
  })
  const get = (k: string, d: number) => {
    const v = rows.find((r) => r.key === k)?.value
    return typeof v === 'number' ? v : d
  }
  const c: SlaCfg = {
    base: get('sla.baseHours', 2),
    perHour: get('sla.qtyPerHour', 25),
    max: get('sla.maxHours', 10),
    unaccepted: get('escalation.unacceptedHours', 2),
  }
  cache = { cfg: c, at: Date.now() }
  return c
}

const addHours = (from: Date, h: number) => new Date(from.getTime() + h * 3_600_000)

export async function stationSlaHours(qty: number) {
  const c = await cfg()
  return Math.min(c.base + Math.floor(qty / c.perHour), c.max)
}

/** Due time for a step that just went in_progress, scaled by job size. */
export async function stationDueAt(qty: number, from = new Date()) {
  return addHours(from, await stationSlaHours(qty))
}

/** Due time for a step waiting to be accepted (escalation → backup → admin). */
export async function acceptanceDueAt(from = new Date()) {
  const c = await cfg()
  return addHours(from, c.unaccepted)
}
