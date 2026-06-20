import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'
import { notifyDepartment, notifyAdmins } from '../lib/notify.js'
import { acceptanceDueAt, stationDueAt } from '../lib/sla.js'

const jobBrief = {
  id: true,
  jobNo: true,
  displayLabel: true,
  priority: true,
  totalQty: true,
  status: true,
  product: { select: { code: true, name: true } },
}

export async function qcRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // jobs QC can act on: already at QC, plus jobs still IN PRODUCTION (so QC can
  // receive them in when they physically arrive — pipeline-v2 has no QC arm-scan).
  app.get('/queue', async () => {
    const steps = await prisma.jobStep.findMany({
      where: {
        OR: [
          { department: { code: 'QC' }, status: { in: ['waiting_acceptance', 'in_progress'] } },
          { department: { code: 'PRODUCTION' }, status: 'in_progress' },
        ],
        job: { status: { notIn: ['closed', 'cancelled'] } },
      },
      orderBy: [{ slaDueAt: 'asc' }],
      select: { status: true, department: { select: { code: true } }, job: { select: jobBrief } },
    })
    return { jobs: steps.map((s) => ({ ...s.job, stepStatus: s.status, atProduction: s.department.code === 'PRODUCTION' })) }
  })

  // QC receives a job out of Production → completes Production (auto-outs any open
  // station visits) and opens QC. (Equivalent to a QC arrival gate-scan.)
  app.post('/:jobId/receive', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, status: true, department: { select: { code: true } } } },
        stationVisits: { where: { scanOutAt: null }, select: { id: true } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const prod = job.steps.find((s) => s.department.code === 'PRODUCTION')
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    if (!prod || prod.status !== 'in_progress') return reply.code(409).send({ error: 'not_in_production' })
    const now = new Date()
    const dueAt = await acceptanceDueAt()
    await prisma.$transaction(async (tx) => {
      for (const v of job.stationVisits) {
        await tx.stationVisit.updateMany({ where: { id: v.id, scanOutAt: null }, data: { scanOutAt: now, scanOutMode: 'auto', version: { increment: 1 } } })
      }
      if (job.stationVisits.length) await tx.jobEvent.create({ data: { jobId, type: 'station_out', actorId, body: '★ auto-out on QC receive' } })
      await tx.jobStep.update({ where: { id: prod.id }, data: { status: 'completed', completedAt: now, completedById: actorId, version: { increment: 1 } } })
      if (qcStep) await tx.jobStep.update({ where: { id: qcStep.id }, data: { status: 'in_progress', acceptedAt: now, acceptedById: actorId, slaDueAt: dueAt, version: { increment: 1 } } })
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_qc', version: { increment: 1 } } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: prod.id, type: 'completed', actorId, body: 'Production' } })
      await writeAudit('job', jobId, 'qc_receive', { actorId, after: { status: 'in_qc' }, tx })
    })
    return { ok: true }
  })

  // approve → completes QC, arms FG, records the inspection
  app.post('/:jobId/approve', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z.object({ notes: z.string().max(500).optional() }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { steps: { orderBy: { sequence: 'asc' }, include: { department: { select: { code: true } } } } },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    const fgStep = job.steps.find((s) => s.department.code === 'FG_STOCK')
    if (!qcStep || (qcStep.status !== 'in_progress' && qcStep.status !== 'waiting_acceptance'))
      return reply.code(409).send({ error: 'not_at_qc' })

    const fgDue = await acceptanceDueAt()
    await prisma.$transaction(async (tx) => {
      await tx.jobStep.update({ where: { id: qcStep.id }, data: { status: 'completed', completedAt: new Date(), completedById: actorId, version: { increment: 1 } } })
      if (fgStep) {
        await tx.jobStep.update({ where: { id: fgStep.id }, data: { status: 'waiting_acceptance', slaDueAt: fgDue } })
        await notifyDepartment(tx, fgStep.departmentId, { type: 'new_job', jobId, body: `${job.displayLabel} passed QC → FG Stock` })
      }
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_fg', version: { increment: 1 } } })
      await tx.qcInspection.create({ data: { jobId, result: 'approved', inspectorId: actorId, notes: body.notes ?? null } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: qcStep.id, type: 'qc_result', actorId, body: 'approved' } })
      await writeAudit('job', jobId, 'qc_approve', { actorId, after: { status: 'in_fg' }, tx })
    })
    return { ok: true }
  })

  // ── per-station QC (docs/12 phase 4) ───────────────────────────────────────
  // QC sits at the stations: jobs currently in Production + their station visits,
  // so QC can mark each visit checked / flag an issue. Non-blocking for movement.
  app.get('/production', { preHandler: requireRole('admin', 'qc') }, async () => {
    const steps = await prisma.jobStep.findMany({
      where: { department: { code: 'PRODUCTION' }, status: 'in_progress', job: { status: { notIn: ['closed', 'cancelled'] } } },
      orderBy: { slaDueAt: 'asc' },
      select: {
        job: {
          select: {
            ...jobBrief,
            stationVisits: { orderBy: { scanInAt: 'desc' }, select: { id: true, scanInAt: true, scanOutAt: true, qcChecked: true, qcIssue: true, qcNote: true, qcResolvedAt: true, operatorId: true, station: { select: { code: true, name: true } } } },
          },
        },
      },
    })
    return { jobs: steps.map((s) => s.job) }
  })

  // QC marks a station visit: checked (good), issue (flag + note), or resolve.
  app.post('/visit/:visitId', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { visitId } = z.object({ visitId: z.string().uuid() }).parse(req.params)
    const body = z.object({ checked: z.boolean().optional(), issue: z.boolean().optional(), note: z.string().max(500).optional(), resolve: z.boolean().optional() }).safeParse(req.body ?? {})
    if (!body.success) return reply.code(400).send({ error: 'bad_request' })
    const actorId = (req.user as AccessPayload).sub
    const v = await prisma.stationVisit.findUnique({ where: { id: visitId }, select: { id: true, jobId: true, station: { select: { name: true } } } })
    if (!v) return reply.code(404).send({ error: 'not_found' })

    const now = new Date()
    const data = body.data.resolve
      ? { qcResolvedAt: now, qcById: actorId, qcAt: now }
      : { qcChecked: body.data.checked ?? true, qcIssue: body.data.issue ?? false, qcNote: body.data.note ?? null, qcById: actorId, qcAt: now, qcResolvedAt: body.data.issue ? null : undefined }
    await prisma.$transaction(async (tx) => {
      await tx.stationVisit.update({ where: { id: visitId }, data })
      const label = body.data.resolve ? `QC issue resolved · ${v.station.name}` : body.data.issue ? `⚠ QC issue · ${v.station.name}${body.data.note ? ` — ${body.data.note}` : ''}` : `QC checked · ${v.station.name}`
      await tx.jobEvent.create({ data: { jobId: v.jobId, type: 'qc_result', actorId, body: label } })
      if (body.data.issue) await notifyAdmins(tx, { type: 'escalation', jobId: v.jobId, body: `QC issue at ${v.station.name}${body.data.note ? `: ${body.data.note}` : ''}` })
      await writeAudit('station_visit', visitId, 'qc_mark', { actorId, after: { issue: !!body.data.issue, resolve: !!body.data.resolve }, tx })
    })
    return { ok: true }
  })

  // pipeline-v2: rework goes back to PRODUCTION. QC may aim it at a specific
  // station (reworkStationId) or leave it for the production head to route.
  app.get('/:jobId/rework-targets', { preHandler: requireRole('admin', 'qc') }, async (_req, reply) => {
    const stations = await prisma.station.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true } })
    // null target = "back to Production — head decides which station"
    return { stations }
  })

  // rework → reopen PRODUCTION (the job re-flows: stations re-scan, then QC pulls it
  // back). Records the inspection with the issue note + optional defect photo and an
  // optional target station; notifies the floor + admins.
  app.post('/:jobId/rework', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(req.params)
    const body = z
      .object({
        notes: z.string().min(1).max(500),
        reworkStationId: z.string().uuid().optional(), // specific station, else back to Production
        photoUrl: z.string().max(3_000_000).optional(), // defect photo (data URL)
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: 'notes required' })
    const actorId = (req.user as AccessPayload).sub
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: {
        displayLabel: true,
        totalQty: true,
        steps: { orderBy: { sequence: 'asc' }, select: { id: true, status: true, version: true, departmentId: true, department: { select: { code: true, name: true } } } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    const qcStep = job.steps.find((s) => s.department.code === 'QC')
    const prodStep = job.steps.find((s) => s.department.code === 'PRODUCTION')
    if (!qcStep || (qcStep.status !== 'in_progress' && qcStep.status !== 'waiting_acceptance'))
      return reply.code(409).send({ error: 'not_at_qc' })
    if (!prodStep) return reply.code(409).send({ error: 'no_production_step' })

    let targetStation: { id: string; name: string } | null = null
    if (body.data.reworkStationId) {
      targetStation = await prisma.station.findUnique({ where: { id: body.data.reworkStationId }, select: { id: true, name: true } })
      if (!targetStation) return reply.code(400).send({ error: 'invalid_target_station' })
    }
    const where = targetStation ? ` → ${targetStation.name}` : ' → Production (head decides)'

    const dueAt = await stationDueAt(job.totalQty)
    await prisma.$transaction(async (tx) => {
      // reopen PRODUCTION, reset QC back to pending
      await tx.jobStep.update({
        where: { id: prodStep.id },
        data: { status: 'in_progress', completedAt: null, completedById: null, slaDueAt: dueAt, version: { increment: 1 } },
      })
      await tx.jobStep.update({
        where: { id: qcStep.id },
        data: { status: 'pending', acceptedAt: null, acceptedById: null, completedAt: null, completedById: null, slaDueAt: null, version: { increment: 1 } },
      })
      await tx.job.update({ where: { id: jobId }, data: { status: 'in_production', version: { increment: 1 } } })
      await tx.qcInspection.create({ data: { jobId, result: 'rework', inspectorId: actorId, notes: body.data.notes, photoUrl: body.data.photoUrl ?? null, reworkStationId: targetStation?.id ?? null } })
      await tx.jobEvent.create({ data: { jobId, jobStepId: qcStep.id, type: 'qc_result', actorId, body: `rework${where}: ${body.data.notes}` } })
      await notifyDepartment(tx, prodStep.departmentId, { type: 'new_job', jobId, body: `Rework: ${job.displayLabel} back to Production${targetStation ? ` (${targetStation.name})` : ''} — ${body.data.notes}` })
      await notifyAdmins(tx, { type: 'escalation', body: `QC rework on ${job.displayLabel}${where}: ${body.data.notes}`, jobId })
      await writeAudit('job', jobId, 'qc_rework', { actorId, after: { reworkStation: targetStation?.name ?? null, notes: body.data.notes }, tx })
    })
    return { ok: true, sentBackTo: targetStation?.name ?? 'Production' }
  })

  // ══════════════════════ QC as a PARALLEL department (docs/12) ══════════════════
  // QC stands at every station and may raise a report against ANY active job at ANY
  // time — no gate, no handoff. Reports auto-tag to the station the inspector is at.
  // issue = SOFT-flag by default (work continues, FG close flagged + admin notified);
  // QC may request a HARD HOLD which needs ADMIN APPROVAL to engage and then blocks
  // FG/dispatch. suggestion/note are advisory. Resolved by QC or the Production head.

  const obsJob = { id: true, jobNo: true, displayLabel: true, status: true, product: { select: { code: true, name: true } } }

  async function withNames<T extends { raisedById: string; resolvedById: string | null }>(rows: T[]) {
    const ids = [...new Set(rows.flatMap((r) => [r.raisedById, r.resolvedById]).filter(Boolean) as string[])]
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : []
    const m = Object.fromEntries(users.map((u) => [u.id, u.fullName]))
    return rows.map((r) => ({ ...r, raisedByName: m[r.raisedById] ?? '—', resolvedByName: r.resolvedById ? m[r.resolvedById] ?? '—' : null }))
  }

  // stations the QC inspector can stand at (for the desk picker)
  app.get('/stations', { preHandler: requireRole('admin', 'qc') }, async () => {
    const stations = await prisma.station.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, code: true, name: true } })
    return { stations }
  })

  // active jobs QC can report on (not closed/cancelled), newest first
  app.get('/reportable-jobs', { preHandler: requireRole('admin', 'qc') }, async () => {
    const jobs = await prisma.job.findMany({
      where: { status: { notIn: ['closed', 'cancelled', 'draft'] } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: { ...obsJob, _count: { select: { qcObservations: { where: { status: 'open' } } } } },
    })
    return { jobs: jobs.map((j) => ({ ...j, openReports: j._count.qcObservations })) }
  })

  // QC raises a report. Auto-tagged to the inspector's current station.
  app.post('/report', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const body = z
      .object({
        jobId: z.string().uuid(),
        stationId: z.string().uuid().optional(), // the station QC is standing at
        kind: z.enum(['issue', 'suggestion', 'note']).default('issue'),
        severity: z.enum(['minor', 'major', 'critical']).optional(),
        note: z.string().trim().min(1).max(1000),
        photoUrl: z.string().max(3_000_000).optional(),
        holdRequested: z.boolean().optional(), // issue only
      })
      .safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues[0]?.message })
    const actorId = (req.user as AccessPayload).sub
    const { jobId, stationId, kind, note, photoUrl } = body.data
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { displayLabel: true, status: true } })
    if (!job) return reply.code(404).send({ error: 'not_found' })
    if (job.status === 'closed' || job.status === 'cancelled') return reply.code(409).send({ error: 'job_terminal' })
    const station = stationId ? await prisma.station.findUnique({ where: { id: stationId }, select: { name: true } }) : null
    if (stationId && !station) return reply.code(400).send({ error: 'invalid_station' })
    // hold only applies to issues
    const holdRequested = kind === 'issue' ? !!body.data.holdRequested : false
    const severity = kind === 'issue' ? body.data.severity ?? null : null
    const at = station ? ` @ ${station.name}` : ''

    const created = await prisma.$transaction(async (tx) => {
      const obs = await tx.qcObservation.create({
        data: { jobId, stationId: stationId ?? null, kind, severity, note, photoUrl: photoUrl ?? null, holdRequested, raisedById: actorId },
        select: { id: true },
      })
      const tag = kind === 'issue' ? `⚠ QC issue${severity ? ` (${severity})` : ''}` : kind === 'suggestion' ? '💡 QC suggestion' : '📝 QC note'
      await tx.jobEvent.create({ data: { jobId, type: 'qc_result', actorId, body: `${tag}${at}: ${note}` } })
      if (kind === 'issue') {
        await notifyAdmins(tx, {
          type: 'escalation',
          jobId,
          body: holdRequested
            ? `QC requests HARD HOLD on ${job.displayLabel}${at} — needs your approval: ${note}`
            : `QC issue on ${job.displayLabel}${at}${severity ? ` (${severity})` : ''}: ${note}`,
        })
      }
      await writeAudit('qc_observation', obs.id, 'raise', { actorId, after: { jobId, kind, severity, holdRequested }, tx })
      return obs
    })
    return { ok: true, id: created.id, holdRequested }
  })

  // station-scoped feed: all reports raised at a station (+ optional status filter).
  // Omit stationId to see every QC report. Newest first.
  app.get('/reports', { preHandler: requireRole('admin', 'qc') }, async (req) => {
    const q = z.object({ stationId: z.string().uuid().optional(), status: z.enum(['open', 'resolved', 'dismissed']).optional(), scope: z.enum(['station', 'all']).optional() }).parse(req.query ?? {})
    const rows = await prisma.qcObservation.findMany({
      where: { ...(q.scope === 'all' ? {} : q.stationId ? { stationId: q.stationId } : {}), ...(q.status ? { status: q.status } : {}) },
      orderBy: [{ status: 'asc' }, { raisedAt: 'desc' }],
      take: 200,
      select: {
        id: true, jobId: true, stationId: true, kind: true, severity: true, note: true, photoUrl: true,
        holdRequested: true, holdApproved: true, status: true, raisedById: true, raisedAt: true,
        resolvedById: true, resolvedAt: true, resolutionNote: true,
        job: { select: obsJob }, station: { select: { code: true, name: true } },
      },
    })
    return { reports: await withNames(rows) }
  })

  // ADMIN approves a requested hard hold → block engages (FG/dispatch now blocked).
  app.post('/reports/:id/approve-hold', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const obs = await prisma.qcObservation.findUnique({ where: { id }, select: { id: true, status: true, kind: true, holdApproved: true, jobId: true, job: { select: { displayLabel: true } } } })
    if (!obs) return reply.code(404).send({ error: 'not_found' })
    if (obs.status !== 'open') return reply.code(409).send({ error: 'not_open' })
    if (obs.holdApproved) return reply.code(409).send({ error: 'already_held' })
    await prisma.$transaction(async (tx) => {
      await tx.qcObservation.update({ where: { id }, data: { holdRequested: true, holdApproved: true, holdApprovedById: actorId, holdApprovedAt: new Date() } })
      await tx.jobEvent.create({ data: { jobId: obs.jobId, type: 'hold', actorId, body: '⛔ Hard hold engaged (admin approved) — FG/dispatch blocked until resolved' } })
      await writeAudit('qc_observation', id, 'approve_hold', { actorId, tx })
    })
    return { ok: true, held: true }
  })

  // resolve a report (QC or the Production head). Lifts any hard hold.
  app.post('/reports/:id/resolve', { preHandler: requireRole('admin', 'qc', 'dept_head') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    const obs = await prisma.qcObservation.findUnique({ where: { id }, select: { id: true, status: true, kind: true, holdApproved: true, jobId: true, raisedById: true, job: { select: { displayLabel: true } } } })
    if (!obs) return reply.code(404).send({ error: 'not_found' })
    if (obs.status !== 'open') return reply.code(409).send({ error: 'not_open' })
    await prisma.$transaction(async (tx) => {
      await tx.qcObservation.update({ where: { id }, data: { status: 'resolved', resolvedById: actorId, resolvedAt: new Date(), resolutionNote: body.note ?? null, holdApproved: false } })
      await tx.jobEvent.create({ data: { jobId: obs.jobId, type: 'qc_result', actorId, body: `✓ QC report resolved${obs.holdApproved ? ' (hold lifted)' : ''}${body.note ? `: ${body.note}` : ''}` } })
      if (obs.holdApproved) await notifyAdmins(tx, { type: 'escalation', jobId: obs.jobId, body: `Hard hold lifted on ${obs.job.displayLabel}` })
      await writeAudit('qc_observation', id, 'resolve', { actorId, tx })
    })
    return { ok: true }
  })

  // dismiss a suggestion/note that won't be actioned (QC or admin)
  app.post('/reports/:id/dismiss', { preHandler: requireRole('admin', 'qc') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const obs = await prisma.qcObservation.findUnique({ where: { id }, select: { status: true, holdApproved: true, jobId: true } })
    if (!obs) return reply.code(404).send({ error: 'not_found' })
    if (obs.status !== 'open') return reply.code(409).send({ error: 'not_open' })
    if (obs.holdApproved) return reply.code(409).send({ error: 'held_cannot_dismiss', hint: 'resolve the hold instead' })
    await prisma.qcObservation.update({ where: { id }, data: { status: 'dismissed', resolvedById: actorId, resolvedAt: new Date() } })
    await writeAudit('qc_observation', id, 'dismiss', { actorId })
    return { ok: true }
  })
}
