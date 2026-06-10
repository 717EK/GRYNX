import { prisma } from './prisma.js'
import { notifyMaintenanceCrew, notifyAdmins } from './notify.js'

// Escalation thresholds (minutes), from Settings; sensible defaults if unset.
async function thresholds() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['maint.escalation.acknowledgeMins', 'maint.escalation.assignMins'] } },
  })
  const get = (k: string, d: number) => {
    const v = rows.find((r) => r.key === k)?.value
    return typeof v === 'number' ? v : d
  }
  return { ackMins: get('maint.escalation.acknowledgeMins', 15), assignMins: get('maint.escalation.assignMins', 30) }
}

// One escalation pass. Tickets still OPEN (unassigned) past the thresholds get
// re-notified / escalated — once per level, guarded by escalationLevel so it
// never spams. Returns how many fired at each level.
export async function runEscalationSweep(): Promise<{ acked: number; escalated: number }> {
  const { ackMins, assignMins } = await thresholds()
  const now = Date.now()

  // Level 2 — unassigned past assignMins → escalate to admins.
  const lvl2 = await prisma.maintenanceTicket.findMany({
    where: { status: 'open', escalationLevel: { lt: 2 }, createdAt: { lt: new Date(now - assignMins * 60_000) } },
    select: { id: true, ticketNo: true, locationText: true, priority: true },
  })
  for (const t of lvl2) {
    await notifyAdmins(prisma, {
      type: 'escalation',
      body: `⚠ ${t.ticketNo} still unassigned ${assignMins}m+ — ${t.priority.toUpperCase()} @ ${t.locationText}`,
      entityId: t.id,
    })
    await prisma.maintenanceTicket.update({ where: { id: t.id }, data: { escalationLevel: 2 } })
  }

  // Level 1 — unacknowledged (still open) past ackMins → re-notify crew + admins.
  const lvl1 = await prisma.maintenanceTicket.findMany({
    where: { status: 'open', escalationLevel: 0, createdAt: { lt: new Date(now - ackMins * 60_000) } },
    select: { id: true, ticketNo: true, locationText: true, priority: true },
  })
  for (const t of lvl1) {
    await notifyMaintenanceCrew(prisma, { type: 'escalation', body: `⏰ ${t.ticketNo} unacknowledged ${ackMins}m — ${t.priority.toUpperCase()} @ ${t.locationText}`, ticketId: t.id })
    await notifyAdmins(prisma, { type: 'escalation', body: `⏰ ${t.ticketNo} unacknowledged ${ackMins}m @ ${t.locationText}`, entityId: t.id })
    await prisma.maintenanceTicket.update({ where: { id: t.id }, data: { escalationLevel: 1 } })
  }

  return { acked: lvl1.length, escalated: lvl2.length }
}

let timer: ReturnType<typeof setInterval> | null = null

/** Start the recurring escalation sweep (in-process; fine for a single API instance). */
export function startEscalationSweep(intervalMs = 60_000) {
  if (timer) return
  timer = setInterval(() => {
    runEscalationSweep().catch(() => {})
  }, intervalMs)
  if (typeof timer.unref === 'function') timer.unref()
}
