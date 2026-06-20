import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { JobStatus, StepStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { notifyDepartment } from '../lib/notify.js'
import { writeAudit } from '../lib/audit.js'

const ACTIVE: JobStatus[] = [JobStatus.approved, JobStatus.in_production, JobStatus.in_qc, JobStatus.in_fg, JobStatus.close_requested]
const AT_STATION: StepStatus[] = [StepStatus.waiting_acceptance, StepStatus.in_progress]

// Aggregated control-centre stats — computed in the DB so it scales past a board.
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/stats', { preHandler: requireRole('admin') }, async () => {
    const since = new Date(Date.now() - 13 * 86400_000)
    since.setHours(0, 0, 0, 0)

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

    const [statusGroups, productGroups, maintGroups, wip, openTickets, recent, products, deptGroups, departments, closureJobs, escalated, onHold, overdueCount, overdueList, completedToday, activity, overdueByDept, onHoldByDept, urgentJobs, agingSteps, holdGroups, pendingPpc, pendingUsers] = await Promise.all([
      prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.job.groupBy({ by: ['productId'], _count: { _all: true }, _sum: { totalQty: true } }),
      prisma.maintenanceTicket.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.job.aggregate({ _sum: { totalQty: true }, where: { status: { in: ACTIVE } } }),
      prisma.maintenanceTicket.count({ where: { status: { notIn: ['closed'] } } }),
      prisma.job.findMany({
        where: { OR: [{ createdAt: { gte: since } }, { completionDate: { gte: since } }] },
        select: { createdAt: true, completionDate: true },
      }),
      prisma.product.findMany({ select: { id: true, code: true, name: true } }),
      // current WIP per department (the bottleneck view) — only where the job is
      // actively being worked (in_progress), so a job isn't double-counted at both
      // its current station and the next-armed station
      prisma.jobStep.groupBy({ by: ['departmentId'], where: { status: StepStatus.in_progress, job: { status: { in: ACTIVE } } }, _count: { _all: true } }),
      prisma.department.findMany({ select: { id: true, code: true, name: true, sortOrder: true } }),
      // attention feed
      prisma.job.findMany({ where: { status: 'close_requested' }, select: { id: true, displayLabel: true }, orderBy: { updatedAt: 'desc' }, take: 6 }),
      prisma.maintenanceTicket.findMany({ where: { escalationLevel: { gte: 1 }, status: { notIn: ['closed'] } }, select: { id: true, ticketNo: true, locationText: true }, orderBy: { escalationLevel: 'desc' }, take: 6 }),
      prisma.jobStep.findMany({ where: { status: 'on_hold' }, select: { job: { select: { id: true, displayLabel: true } }, department: { select: { name: true } } }, take: 6 }),
      // SLA: active jobs whose current step is past its due time (aging/overdue)
      prisma.jobStep.count({ where: { status: { in: AT_STATION }, slaDueAt: { lt: new Date() }, job: { status: { in: ACTIVE } } } }),
      prisma.jobStep.findMany({ where: { status: { in: AT_STATION }, slaDueAt: { lt: new Date() }, job: { status: { in: ACTIVE } } }, select: { slaDueAt: true, job: { select: { id: true, displayLabel: true } }, department: { select: { name: true } } }, orderBy: { slaDueAt: 'asc' }, take: 6 }),
      // jobs closed today (KPI)
      prisma.job.count({ where: { status: 'closed', completionDate: { gte: todayStart } } }),
      // recent activity feed — last events across the floor
      prisma.jobEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 12, select: { id: true, type: true, body: true, createdAt: true, job: { select: { displayLabel: true } } } }),
      // per-department health: overdue + on-hold step counts
      prisma.jobStep.groupBy({ by: ['departmentId'], where: { status: { in: AT_STATION }, slaDueAt: { lt: new Date() }, job: { status: { in: ACTIVE } } }, _count: { _all: true } }),
      prisma.jobStep.groupBy({ by: ['departmentId'], where: { status: 'on_hold' }, _count: { _all: true } }),
      // mission-control: urgent active jobs, aging (longest at current station), hold reasons
      prisma.job.findMany({ where: { priority: 'urgent', status: { in: ACTIVE } }, select: { id: true, displayLabel: true }, orderBy: { createdAt: 'asc' }, take: 8 }),
      prisma.jobStep.findMany({ where: { status: StepStatus.in_progress, job: { status: { in: ACTIVE } } }, select: { acceptedAt: true, job: { select: { id: true, displayLabel: true } }, department: { select: { name: true } } }, orderBy: { acceptedAt: 'asc' }, take: 6 }),
      prisma.hold.groupBy({ by: ['reasonCode'], where: { resolvedAt: null }, _count: { _all: true } }),
      // menu badges
      prisma.ppcRequest.count({ where: { status: 'submitted' } }),
      prisma.user.count({ where: { status: 'pending' } }),
    ])

    const sc = (s: string) => statusGroups.find((g) => g.status === s)?._count._all ?? 0
    const active = ACTIVE.reduce((n, s) => n + sc(s), 0)

    // status mix (for the donut)
    const statusMix = statusGroups.map((g) => ({ status: g.status, count: g._count._all })).sort((a, b) => b.count - a.count)

    // by product (top by job count)
    const pmap = Object.fromEntries(products.map((p) => [p.id, p]))
    const byProduct = productGroups
      .map((g) => ({ product: pmap[g.productId]?.name ?? '—', code: pmap[g.productId]?.code ?? '?', count: g._count._all, units: g._sum.totalQty ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // daily throughput, last 14 days
    const days: { day: string; key: string; created: number; closed: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000)
      const key = d.toISOString().slice(0, 10)
      days.push({ key, day: d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }), created: 0, closed: 0 })
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.key, i]))
    for (const j of recent) {
      const ck = j.createdAt.toISOString().slice(0, 10)
      if (idx[ck] != null) days[idx[ck]].created++
      if (j.completionDate) { const xk = j.completionDate.toISOString().slice(0, 10); if (idx[xk] != null) days[idx[xk]].closed++ }
    }

    const maintenance = maintGroups.map((g) => ({ status: g.status, count: g._count._all }))

    // department load (bottleneck) — jobs currently at each station, busiest first
    const dmap = Object.fromEntries(departments.map((d) => [d.id, d]))
    const loadOf = Object.fromEntries(deptGroups.map((g) => [g.departmentId, g._count._all]))
    const overdueOf = Object.fromEntries(overdueByDept.map((g) => [g.departmentId, g._count._all]))
    const holdOf = Object.fromEntries(onHoldByDept.map((g) => [g.departmentId, g._count._all]))
    const byDepartment = deptGroups
      .map((g) => ({ department: dmap[g.departmentId]?.name ?? '—', code: dmap[g.departmentId]?.code ?? '?', count: g._count._all }))
      .sort((a, b) => b.count - a.count)

    // department health — every department, with load + a tone derived from exceptions
    const departmentHealth = departments
      .map((d) => {
        const load = loadOf[d.id] ?? 0
        const overdue = overdueOf[d.id] ?? 0
        const onHoldN = holdOf[d.id] ?? 0
        const tone: 'good' | 'delay' | 'alert' = overdue > 0 || onHoldN > 0 ? 'alert' : load >= 4 ? 'delay' : 'good'
        return { code: d.code, department: d.name, load, overdue, onHold: onHoldN, tone }
      })
      .sort((a, b) => b.load - a.load)

    // recent activity feed
    const ACT_VERB: Record<string, string> = {
      created: 'created', accepted: 'arrived at station', completed: 'completed', hold: 'put on hold', resume: 'resumed',
      qc_result: 'QC result recorded', scan: 'scanned', cancelled: 'cancelled', closure_requested: 'closure requested',
      closed: 'closed', forced_advance: 'force-advanced', split: 'split', merge: 'merged', note: 'noted',
      update_request: 'change requested', update_reply: 'change answered',
    }
    const recentActivity = activity.map((e) => ({
      id: e.id,
      label: e.job?.displayLabel ?? '—',
      text: e.body ? `${ACT_VERB[e.type] ?? e.type} · ${e.body}` : (ACT_VERB[e.type] ?? e.type),
      at: e.createdAt.toISOString(),
    }))

    // ── mission-control widgets ───────────────────────────────────────────────
    const onHoldTotal = onHoldByDept.reduce((n, g) => n + g._count._all, 0)
    const snapshot = { active, onHold: onHoldTotal, urgent: urgentJobs.length, inQc: sc('in_qc') }
    // live pipeline — every stage in flow order, with WIP + holds
    const pipeline = [...departments]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((d) => ({ code: d.code, department: d.name, count: loadOf[d.id] ?? 0, hold: holdOf[d.id] ?? 0 }))
    // aging — active jobs sitting longest at their current station
    const ageDays = (d: Date | null) => (d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400_000)) : 0)
    const aging = agingSteps
      .map((s) => ({ id: s.job.id, label: s.job.displayLabel, dept: s.department.name, days: ageDays(s.acceptedAt) }))
      .sort((a, b) => b.days - a.days)
    const HOLD_LABEL: Record<string, string> = { material: 'Material Wait', breakdown: 'Machine Issue', approval: 'Approval', resource: 'Manpower', other: 'Other' }
    const holds = holdGroups.map((g) => ({ code: g.reasonCode, label: HOLD_LABEL[g.reasonCode] ?? g.reasonCode, count: g._count._all })).sort((a, b) => b.count - a.count)
    const urgent = urgentJobs.map((j) => ({ id: j.id, label: j.displayLabel }))

    // pipeline-v2: live production-station occupancy (jobs with an OPEN visit)
    const openVisits = await prisma.stationVisit.groupBy({
      by: ['stationId'],
      where: { scanOutAt: null, job: { status: { notIn: ['closed', 'cancelled'] } } },
      _count: { _all: true },
    })
    const visitCountOf = Object.fromEntries(openVisits.map((g) => [g.stationId, g._count._all]))
    const stationRows = await prisma.station.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    const stations = stationRows.map((s) => ({ name: s.name, wip: visitCountOf[s.id] ?? 0 }))

    // attention feed — what needs an admin's eyes, most urgent first
    const overdueMins = (d: Date | null) => (d ? Math.max(0, Math.round((Date.now() - d.getTime()) / 60000)) : 0)
    const attention = [
      ...escalated.map((t) => ({ kind: 'ticket' as const, id: t.id, label: t.ticketNo, sub: `Escalated · ${t.locationText}` })),
      ...overdueList.map((s) => ({ kind: 'job' as const, id: s.job.id, label: s.job.displayLabel, sub: `Overdue ${overdueMins(s.slaDueAt)}m · ${s.department.name}` })),
      ...onHold.map((s) => ({ kind: 'job' as const, id: s.job.id, label: s.job.displayLabel, sub: `On hold · ${s.department.name}` })),
      ...closureJobs.map((j) => ({ kind: 'job' as const, id: j.id, label: j.displayLabel, sub: 'Closure requested' })),
    ]

    return {
      kpis: {
        totalJobs: statusGroups.reduce((n, g) => n + g._count._all, 0),
        active,
        inProduction: sc('in_production'),
        inQc: sc('in_qc'),
        inFg: sc('in_fg'),
        closureRequested: sc('close_requested'),
        closed: sc('closed'),
        unitsWip: wip._sum?.totalQty ?? 0,
        openTickets,
        overdue: overdueCount,
        completedToday,
        pendingPpc,
        pendingUsers,
      },
      statusMix,
      byProduct,
      byDepartment,
      departmentHealth,
      recentActivity,
      throughput: days.map((d) => ({ day: d.day, created: d.created, closed: d.closed })),
      maintenance,
      attention,
      snapshot,
      pipeline,
      stations,
      aging,
      holds,
      urgent,
    }
  })

  // Calendar: active jobs on their start date, closed jobs on completion date.
  // ── pipeline-v2 dwell analytics: what the StationVisit trail is FOR ─────────
  // Per-station average dwell + visit volume, per-operator throughput, and the
  // longest individual stays — last 30 days. Aggregated in JS (floor volumes are
  // small); auto-closed (★) visits count but their dwell is system-approximated.
  app.get('/analytics', { preHandler: requireRole('admin') }, async () => {
    const since = new Date(Date.now() - 30 * 86400_000)
    const visits = await prisma.stationVisit.findMany({
      where: { scanInAt: { gte: since } },
      select: {
        stationId: true, operatorId: true, scanInAt: true, scanOutAt: true, scanOutMode: true, jobId: true,
        remark: true,
        station: { select: { name: true } },
        job: { select: { id: true, displayLabel: true, name: true } },
      },
    })
    const stationRows = await prisma.station.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } })
    const operatorIds = [...new Set(visits.map((v) => v.operatorId))]
    const users = await prisma.user.findMany({ where: { id: { in: operatorIds } }, select: { id: true, fullName: true } })
    const nameOf = (id: string) => users.find((u) => u.id === id)?.fullName ?? '—'
    const mins = (v: { scanInAt: Date; scanOutAt: Date | null }) =>
      v.scanOutAt ? Math.max(0, Math.round((v.scanOutAt.getTime() - v.scanInAt.getTime()) / 60000)) : null

    const stations = stationRows.map((s) => {
      const vs = visits.filter((v) => v.stationId === s.id)
      const closed = vs.map(mins).filter((m): m is number => m !== null)
      return {
        name: s.name,
        visits: vs.length,
        open: vs.filter((v) => !v.scanOutAt).length,
        avgDwellMins: closed.length ? Math.round(closed.reduce((a, b) => a + b, 0) / closed.length) : 0,
        autoOuts: vs.filter((v) => v.scanOutMode === 'auto').length,
      }
    })

    const operators = operatorIds
      .map((id) => {
        const vs = visits.filter((v) => v.operatorId === id)
        const closed = vs.map(mins).filter((m): m is number => m !== null)
        return {
          name: nameOf(id),
          visits: vs.length,
          jobs: new Set(vs.map((v) => v.jobId)).size,
          avgDwellMins: closed.length ? Math.round(closed.reduce((a, b) => a + b, 0) / closed.length) : 0,
        }
      })
      .sort((a, b) => b.visits - a.visits)

    const slowest = visits
      .map((v) => ({ label: v.job.name || v.job.displayLabel, jobId: v.job.id, station: v.station.name, operator: nameOf(v.operatorId), mins: mins(v), auto: v.scanOutMode === 'auto' }))
      .filter((x): x is typeof x & { mins: number } => x.mins !== null)
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 8)

    return { since: since.toISOString(), stations, operators, slowest, totalVisits: visits.length }
  })

  // ── daily rhythm (docs/12 phase 7) — the owner's twice-a-day glance ─────────
  // Morning agenda: what's urgent / overdue / due today / waiting on a decision.
  app.get('/agenda', { preHandler: requireRole('admin') }, async () => {
    const now = new Date()
    const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999)
    const staleBefore = new Date(now.getTime() - 4 * 60 * 60 * 1000) // a hard hold open >4h is escalated
    const [overdue, urgentOrders, awaitingForward, ppcRequests, dispatchToApprove, closuresToApprove, openQcIssues, qcHoldsToApprove, qcStaleHolds, qcEscapes, openTickets, dueOrders] = await Promise.all([
      prisma.jobStep.findMany({
        where: { slaDueAt: { lt: now }, status: { in: ['waiting_acceptance', 'in_progress'] }, job: { status: { notIn: ['closed', 'cancelled'] } } },
        select: { slaDueAt: true, department: { select: { name: true } }, job: { select: { id: true, displayLabel: true, name: true } } },
        orderBy: { slaDueAt: 'asc' }, take: 10,
      }),
      prisma.order.findMany({ where: { priority: 'urgent', status: { in: ['submitted', 'planning', 'in_production', 'ready'] } }, select: { id: true, orderNo: true, name: true, client: true, status: true }, take: 10 }),
      prisma.job.count({ where: { designDoneAt: { not: null }, forwardedAt: null, status: { notIn: ['cancelled', 'closed'] } } }),
      prisma.ppcRequest.count({ where: { status: 'submitted' } }),
      prisma.dispatch.count({ where: { status: 'requested' } }),
      prisma.closure.count({ where: { status: 'requested' } }),
      prisma.qcObservation.count({ where: { kind: 'issue', status: 'open' } }),
      prisma.qcObservation.count({ where: { status: 'open', holdRequested: true, holdApproved: false } }),
      prisma.qcObservation.count({ where: { status: 'open', holdApproved: true, holdApprovedAt: { lt: staleBefore } } }),
      prisma.qcObservation.count({ where: { status: 'open', kind: 'issue', job: { status: 'closed' } } }),
      prisma.maintenanceTicket.count({ where: { status: { notIn: ['closed', 'verified'] } } }),
      prisma.order.findMany({ where: { targetDate: { lte: dayEnd }, status: { in: ['submitted', 'planning', 'in_production', 'ready'] } }, select: { id: true, orderNo: true, name: true, client: true, targetDate: true }, orderBy: { targetDate: 'asc' }, take: 10 }),
    ])
    return {
      generatedAt: now.toISOString(),
      overdue: overdue.map((s) => ({ jobId: s.job.id, label: s.job.name || s.job.displayLabel, station: s.department.name, mins: Math.round((now.getTime() - (s.slaDueAt?.getTime() ?? 0)) / 60000) })),
      urgentOrders, dueOrders,
      decisions: { ppcRequests, awaitingForward, dispatchToApprove, closuresToApprove, openQcIssues, qcHoldsToApprove, qcStaleHolds, qcEscapes, openTickets },
    }
  })

  // Evening summary: what actually happened today (rule-based; AI narration later).
  app.get('/summary', { preHandler: requireRole('admin') }, async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const [ordersCreated, jobsCreated, jobsClosed, shipped, scans, qcMarks, qcIssuesRaised, materialNeeds] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: start } } }),
      prisma.job.count({ where: { createdAt: { gte: start } } }),
      prisma.job.count({ where: { status: 'closed', completionDate: { gte: start } } }),
      prisma.dispatch.count({ where: { status: 'shipped', shippedAt: { gte: start } } }),
      prisma.stationVisit.count({ where: { scanInAt: { gte: start } } }),
      prisma.qcObservation.count({ where: { raisedAt: { gte: start } } }),
      prisma.qcObservation.count({ where: { raisedAt: { gte: start }, kind: 'issue' } }),
      prisma.materialRequest.count({ where: { createdAt: { gte: start } } }),
    ])
    return { date: start.toISOString(), ordersCreated, jobsCreated, jobsClosed, shipped, scans, qcMarks, qcIssuesRaised, materialNeeds }
  })

  // One-click "ask the floor for an update" — broadcast to all floor departments
  // or a single one. Notifies the department head(s) (docs/12 §9 air-traffic-control).
  app.post('/ask-update', { preHandler: requireRole('admin') }, async (req, reply) => {
    const body = z.object({ departmentCode: z.string().optional(), note: z.string().max(300).optional() }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const where = body.data.departmentCode ? { code: body.data.departmentCode } : { code: { in: ['DESIGN', 'PRODUCTION', 'QC', 'FG_STOCK'] } }
    const depts = await prisma.department.findMany({ where, select: { id: true, name: true } })
    if (depts.length === 0) return reply.code(404).send({ error: 'no_departments' })
    await prisma.$transaction(async (tx) => {
      for (const d of depts) await notifyDepartment(tx, d.id, { type: 'update_request', body: `Admin asked ${d.name} for a status update${body.data.note ? `: ${body.data.note}` : ''}` })
      await writeAudit('floor', 'broadcast', 'ask_update', { actorId, after: { depts: depts.map((d) => d.name) }, tx })
    })
    return { ok: true, asked: depts.map((d) => d.name) }
  })

  app.get('/calendar', { preHandler: requireRole('admin') }, async (req) => {
    const q = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query)
    const now = new Date()
    const [y, m] = q.month ? q.month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1]
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end = new Date(Date.UTC(y, m, 1))

    const [active, closed] = await Promise.all([
      prisma.job.findMany({
        where: { status: { in: ACTIVE }, OR: [{ startDate: { gte: start, lt: end } }, { startDate: null, createdAt: { gte: start, lt: end } }] },
        select: { id: true, displayLabel: true, status: true, startDate: true, createdAt: true },
      }),
      prisma.job.findMany({
        where: { status: 'closed', completionDate: { gte: start, lt: end } },
        select: { id: true, displayLabel: true, completionDate: true },
      }),
    ])

    type Day = { active: number; closed: number; jobs: { id: string; label: string; status: string; kind: 'active' | 'closed' }[] }
    const days: Record<string, Day> = {}
    const key = (d: Date) => d.toISOString().slice(0, 10)
    const add = (dateStr: string, job: { id: string; displayLabel: string; status?: string }, kind: 'active' | 'closed') => {
      const day = (days[dateStr] ??= { active: 0, closed: 0, jobs: [] })
      day[kind]++
      if (day.jobs.length < 16) day.jobs.push({ id: job.id, label: job.displayLabel, status: job.status ?? 'closed', kind })
    }
    for (const j of active) add(key(j.startDate ?? j.createdAt), j, 'active')
    for (const j of closed) if (j.completionDate) add(key(j.completionDate), j, 'closed')

    return { month: `${y}-${String(m).padStart(2, '0')}`, days }
  })
}
