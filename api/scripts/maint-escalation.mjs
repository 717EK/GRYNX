// Maintenance escalation sweep test. Run:  node --env-file=.env scripts/maint-escalation.mjs
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const B = 'http://localhost:4000'
let pass = 0, fail = 0
const ok = (c, m) => (c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.error('  ✗ ' + m)))
const login = async (u) => (await (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, pin: '123456' }) })).json()).accessToken
const call = async (m, p, tok, body) => { const r = await fetch(B + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { s: r.status, j: t ? JSON.parse(t) : null } }
const unread = async (tok) => (await call('GET', '/api/v1/notifications/count', tok)).j.unread
const mins = (n) => new Date(Date.now() - n * 60_000)

;(async () => {
  const laser = await login('laser'), maint = await login('maint'), admin = await login('aashish')

  // two fresh tickets, backdated past the thresholds (15m ack / 30m assign)
  const mk = async (loc) => (await call('POST', '/api/v1/maintenance', laser, { category: 'electrical', priority: 'high', locationText: loc, description: 'escalation test' })).j.ticket.id
  const idAck = await mk('Ack bay')      // will be 20m old -> level 1
  const idEsc = await mk('Escalate bay') // will be 35m old -> level 2
  await prisma.maintenanceTicket.update({ where: { id: idAck }, data: { createdAt: mins(20), escalationLevel: 0 } })
  await prisma.maintenanceTicket.update({ where: { id: idEsc }, data: { createdAt: mins(35), escalationLevel: 0 } })
  ok(true, 'raised 2 tickets, backdated 20m and 35m')

  const aU0 = await unread(admin), cU0 = await unread(maint)
  const sweep = await call('POST', '/api/v1/maintenance/sweep', maint)
  ok(sweep.s === 200 && sweep.j.escalated >= 1 && sweep.j.acked >= 1, `sweep ran (acked ${sweep.j.acked}, escalated ${sweep.j.escalated})`)

  const tAck = await prisma.maintenanceTicket.findUnique({ where: { id: idAck }, select: { escalationLevel: true } })
  const tEsc = await prisma.maintenanceTicket.findUnique({ where: { id: idEsc }, select: { escalationLevel: true } })
  ok(tAck.escalationLevel === 1, 'unacknowledged 20m ticket -> escalationLevel 1')
  ok(tEsc.escalationLevel === 2, 'unassigned 35m ticket -> escalationLevel 2')
  ok(await unread(admin) > aU0, 'admin notified of escalation')
  ok(await unread(maint) > cU0, 'maintenance crew re-notified (ack breach)')

  // idempotent: second sweep must not re-escalate the same tickets
  await call('POST', '/api/v1/maintenance/sweep', maint)
  const tAck2 = await prisma.maintenanceTicket.findUnique({ where: { id: idAck }, select: { escalationLevel: true } })
  ok(tAck2.escalationLevel <= 2, 'no runaway re-escalation (level guarded)')

  // assigning takes it out of 'open' so the sweep ignores it
  const crew = (await call('GET', '/api/v1/maintenance/crew', maint)).j.crew[0]
  await call('POST', `/api/v1/maintenance/${idEsc}/assign`, maint, { assignedToId: crew.id })
  await prisma.maintenanceTicket.update({ where: { id: idEsc }, data: { createdAt: mins(99) } })
  const before = (await prisma.maintenanceTicket.findUnique({ where: { id: idEsc }, select: { escalationLevel: true } })).escalationLevel
  await call('POST', '/api/v1/maintenance/sweep', maint)
  const after = (await prisma.maintenanceTicket.findUnique({ where: { id: idEsc }, select: { escalationLevel: true } })).escalationLevel
  ok(before === after, 'assigned ticket is no longer escalated')

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed')
  await prisma.$disconnect()
  process.exit(fail ? 1 : 0)
})().catch(async (e) => { console.log('ERR', e.message); await prisma.$disconnect(); process.exit(1) })
