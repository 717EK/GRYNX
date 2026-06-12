import type { FastifyInstance, FastifyReply } from 'fastify'
import { Prisma, type JobStatus, type ScanResult } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'
import { resolveStation } from '../lib/station.js'
import { writeAudit } from '../lib/audit.js'
import { notifyDepartment, notifyAdmins } from '../lib/notify.js'
import { stationDueAt, acceptanceDueAt } from '../lib/sla.js'

// ─────────────────────────────────────────────────────────────────────────────
// pipeline-v2 scan engine. The floor has FOUR gated steps — DESIGN → PRODUCTION →
// QC → FG_STOCK — and the former production departments are now STATIONS that live
// inside the single PRODUCTION step. There are two kinds of scan:
//
//   • STATION scan (stationId given): a production sub-station. Free / parallel
//     scan-in → scan-out (StationVisit). No sequence, no skip, no force-advance.
//     The first station scan also flips DESIGN → PRODUCTION. Auto-out (★) closes a
//     stale open visit if the operator forgets and the job moves on.
//   • GATE scan (no stationId): a macro step. DESIGN releases to PRODUCTION; QC
//     pulls the job out of PRODUCTION (auto-outs any open visits); FG acknowledges
//     arrival. QC pass/rework and FG serial-close live in qc.ts / fg.ts.
// ─────────────────────────────────────────────────────────────────────────────

const scanSchema = z.object({
  jobNo: z.string().min(3).max(60), // the scanned code: display label OR opaque jobNo
  idempotencyKey: z.string().uuid(), // one per physical scan; dedups retries
  clientTs: z.coerce.date(), // when the scan physically happened (offline-safe)
  stationId: z.string().uuid().optional(), // a PRODUCTION station scan (in/out)
  stationDepartmentId: z.string().uuid().optional(), // explicit gate dept (admin "view as")
  parallel: z.boolean().default(false), // station scan-in: keep other open visits running
  remark: z.string().max(500).optional(), // station scan-out: what they did
  photoUrl: z.string().max(3_000_000).optional(), // station scan-out: compressed JPEG data URL
  note: z.string().max(500).optional(),
  preview: z.boolean().default(false), // dry-run for the confirm UX
})

type StepRow = {
  id: string
  sequence: number
  status: string
  version: number
  departmentId: string
  department: { code: string; name: string }
}

class ConflictError extends Error {}

export async function scanRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.post('/', async (req, reply) => {
    const parsed = scanSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const body = parsed.data
    const user = req.user as AccessPayload

    // load job + its 4 gated steps + currently-open station visits
    const code = body.jobNo.trim().toUpperCase().replace(/^GRYNX:/, '')
    const job = await prisma.job.findFirst({
      where: { OR: [{ jobNo: code }, { displayLabel: { equals: code, mode: 'insensitive' } }] },
      select: {
        id: true,
        displayLabel: true,
        status: true,
        totalQty: true,
        version: true,
        steps: {
          orderBy: { sequence: 'asc' },
          select: { id: true, sequence: true, status: true, version: true, departmentId: true, department: { select: { code: true, name: true } } },
        },
        stationVisits: { where: { scanOutAt: null }, select: { id: true, stationId: true, version: true } },
      },
    })
    if (!job) return reply.code(404).send({ error: 'job_not_found' })
    if (job.status === 'closed' || job.status === 'cancelled')
      return reply.code(409).send({ error: 'job_terminal', status: job.status })
    const steps = job.steps as StepRow[]
    const stepByCode = (c: string) => steps.find((s) => s.department.code === c)

    // ── STATION scan (production sub-station) ────────────────────────────────
    if (body.stationId) {
      return scanStation(reply, { body, user, job, steps, stepByCode })
    }

    // ── GATE scan (DESIGN / QC / FG) ─────────────────────────────────────────
    const station = resolveStation(user, body.stationDepartmentId)
    if (!station.ok) {
      return reply.code(station.reason === 'ambiguous' ? 409 : 403).send({
        error: station.reason === 'ambiguous' ? 'station_ambiguous' : 'no_station',
        options: station.options,
        hint: 'production scans must include a stationId',
      })
    }
    return scanGate(reply, { body, user, job, steps, stepByCode, gateDeptId: station.departmentId })
  })
}

// ── a stale/forgotten open visit auto-closes (★) when the job moves on ──────────
async function autoOutOpenVisits(
  tx: Prisma.TransactionClient,
  jobId: string,
  actorId: string,
  at: Date,
  open: { id: string; stationId: string; version: number }[],
  exceptStationId?: string,
) {
  for (const v of open) {
    if (exceptStationId && v.stationId === exceptStationId) continue
    const r = await tx.stationVisit.updateMany({
      where: { id: v.id, version: v.version, scanOutAt: null },
      data: { scanOutAt: at, scanOutMode: 'auto', version: { increment: 1 } },
    })
    if (r.count === 1) {
      await tx.jobEvent.create({ data: { jobId, type: 'station_out', actorId, body: '★ auto-out (no scan-out)' } })
    }
  }
}

// ═══════════════════════ production station scan ═══════════════════════
async function scanStation(
  reply: FastifyReply,
  ctx: {
    body: z.infer<typeof scanSchema>
    user: AccessPayload
    job: { id: string; displayLabel: string; status: string; totalQty: number; version: number; stationVisits: { id: string; stationId: string; version: number }[] }
    steps: StepRow[]
    stepByCode: (c: string) => StepRow | undefined
  },
) {
  const { body, user, job, steps, stepByCode } = ctx
  // only admins / production users may scan a station
  const isAdmin = (user.roles ?? []).some((r) => r.role === 'admin')
  const prodStep = stepByCode('PRODUCTION')
  const isProd = (user.roles ?? []).some((r) => r.role === 'dept_head' && r.departmentId === prodStep?.departmentId)
  if (!isAdmin && !isProd) return reply.code(403).send({ error: 'forbidden', hint: 'production access required' })

  const station = await prisma.station.findUnique({ where: { id: body.stationId! }, select: { id: true, name: true, departmentId: true } })
  if (!station) return reply.code(404).send({ error: 'station_not_found' })

  const designStep = stepByCode('DESIGN')
  const open = job.stationVisits.find((v) => v.stationId === station.id)
  const action: 'in' | 'out' = open ? 'out' : 'in'

  if (body.preview) {
    return reply.send({ result: 'applied' as ScanResult, preview: true, label: job.displayLabel, station: station.name, action })
  }

  try {
    const out = await prisma.$transaction(
      async (tx) => {
        // idempotency first — a retried physical scan replays the prior result
        await tx.scanEvent.create({
          data: { jobId: job.id, stationDepartmentId: station.departmentId, scannedById: user.sub, clientTs: body.clientTs, idempotencyKey: body.idempotencyKey, result: 'applied', note: body.note ?? null },
        })

        if (action === 'out') {
          const r = await tx.stationVisit.updateMany({
            where: { id: open!.id, version: open!.version, scanOutAt: null },
            data: { scanOutAt: body.clientTs, scanOutMode: 'explicit', remark: body.remark ?? null, photoUrl: body.photoUrl ?? null, version: { increment: 1 } },
          })
          if (r.count !== 1) throw new ConflictError()
          await tx.jobEvent.create({ data: { jobId: job.id, type: 'station_out', actorId: user.sub, body: `${station.name}${body.remark ? ` · ${body.remark}` : ''}` } })
        } else {
          // scan-in. Unless this is declared parallel work, auto-out any other open visit.
          if (!body.parallel) await autoOutOpenVisits(tx, job.id, user.sub, body.clientTs, job.stationVisits)
          // first time the job hits the floor → close DESIGN, open PRODUCTION
          if (prodStep && prodStep.status !== 'in_progress') {
            if (designStep && designStep.status !== 'completed') {
              await bumpStep(tx, designStep.id, designStep.version, { status: 'completed', completedAt: body.clientTs, completedById: user.sub })
              await tx.jobEvent.create({ data: { jobId: job.id, jobStepId: designStep.id, type: 'completed', actorId: user.sub, body: 'Design' } })
            }
            await bumpStep(tx, prodStep.id, prodStep.version, { status: 'in_progress', acceptedAt: body.clientTs, acceptedById: user.sub, slaDueAt: await stationDueAt(job.totalQty, body.clientTs) })
            await bumpJob(tx, job.id, job.version, 'in_production')
          }
          await tx.stationVisit.create({ data: { jobId: job.id, stationId: station.id, operatorId: user.sub, scanInAt: body.clientTs, remark: body.remark ?? null } })
          await tx.jobEvent.create({ data: { jobId: job.id, type: 'station_in', actorId: user.sub, body: station.name } })
        }

        await writeAudit('station_visit', station.id, action === 'in' ? 'station_in' : 'station_out', { actorId: user.sub, after: { job: job.displayLabel, station: station.name }, tx })
        await tx.notification.updateMany({ where: { userId: user.sub, jobId: job.id, readAt: null }, data: { readAt: body.clientTs } })
        return { result: 'applied' as ScanResult, action, label: job.displayLabel, station: station.name }
      },
      { timeout: 20_000, maxWait: 5_000 },
    )
    return reply.code(200).send(out)
  } catch (e) {
    return handleTxError(e, reply, job.displayLabel, body.idempotencyKey)
  }
}

// ═══════════════════════ macro gate scan ═══════════════════════
async function scanGate(
  reply: FastifyReply,
  ctx: {
    body: z.infer<typeof scanSchema>
    user: AccessPayload
    job: { id: string; displayLabel: string; status: string; totalQty: number; version: number; stationVisits: { id: string; stationId: string; version: number }[] }
    steps: StepRow[]
    stepByCode: (c: string) => StepRow | undefined
    gateDeptId: string
  },
) {
  const { body, user, job, steps, stepByCode, gateDeptId } = ctx
  const gate = steps.find((s) => s.departmentId === gateDeptId)
  if (!gate) return reply.code(409).send({ error: 'station_not_in_pipeline', label: job.displayLabel })
  const codeName = gate.department.code

  if (body.preview) {
    return reply.send({ result: 'applied' as ScanResult, preview: true, label: job.displayLabel, station: gate.department.name })
  }

  try {
    const out = await prisma.$transaction(
      async (tx) => {
        await tx.scanEvent.create({
          data: { jobId: job.id, stationDepartmentId: gateDeptId, scannedById: user.sub, clientTs: body.clientTs, idempotencyKey: body.idempotencyKey, result: 'applied', note: body.note ?? null },
        })

        let newStatus: JobStatus | null = null
        if (codeName === 'DESIGN') {
          // design done → hand off to production
          if (gate.status !== 'completed') {
            await bumpStep(tx, gate.id, gate.version, { status: 'completed', completedAt: body.clientTs, completedById: user.sub })
            await tx.jobEvent.create({ data: { jobId: job.id, jobStepId: gate.id, type: 'completed', actorId: user.sub, body: 'Design' } })
          }
          const prod = stepByCode('PRODUCTION')
          if (prod && prod.status !== 'in_progress' && prod.status !== 'completed') {
            await bumpStep(tx, prod.id, prod.version, { status: 'in_progress', acceptedAt: body.clientTs, acceptedById: user.sub, slaDueAt: await stationDueAt(job.totalQty, body.clientTs) })
            await notifyDepartment(tx, prod.departmentId, { type: 'new_job', jobId: job.id, body: `${job.displayLabel} released to Production` })
          }
          newStatus = 'in_production'
        } else if (codeName === 'QC') {
          // QC pulls the job out of production — settle production + auto-out open visits
          await autoOutOpenVisits(tx, job.id, user.sub, body.clientTs, job.stationVisits)
          const prod = stepByCode('PRODUCTION')
          if (prod && prod.status !== 'completed') {
            await bumpStep(tx, prod.id, prod.version, { status: 'completed', completedAt: body.clientTs, completedById: user.sub })
            await tx.jobEvent.create({ data: { jobId: job.id, jobStepId: prod.id, type: 'completed', actorId: user.sub, body: 'Production' } })
          }
          if (gate.status !== 'in_progress') {
            await bumpStep(tx, gate.id, gate.version, { status: 'in_progress', acceptedAt: body.clientTs, acceptedById: user.sub, slaDueAt: await acceptanceDueAt() })
          }
          newStatus = 'in_qc'
        } else if (codeName === 'FG_STOCK') {
          // FG arrival ack — serial + close live in fg.ts
          if (gate.status === 'waiting_acceptance') {
            await bumpStep(tx, gate.id, gate.version, { status: 'in_progress', acceptedAt: body.clientTs, acceptedById: user.sub })
          }
          newStatus = 'in_fg'
        } else {
          throw new RejectError('unknown_gate')
        }

        if (newStatus) await bumpJob(tx, job.id, job.version, newStatus)
        await tx.jobEvent.create({ data: { jobId: job.id, jobStepId: gate.id, type: 'accepted', actorId: user.sub, body: gate.department.name } })
        await writeAudit('job_step', gate.id, 'scan_gate', { actorId: user.sub, after: { gate: codeName, jobStatus: newStatus }, tx })
        await tx.notification.updateMany({ where: { userId: user.sub, jobId: job.id, readAt: null }, data: { readAt: body.clientTs } })
        return { result: 'applied' as ScanResult, label: job.displayLabel, station: gate.department.name, jobStatus: newStatus }
      },
      { timeout: 20_000, maxWait: 5_000 },
    )
    return reply.code(200).send(out)
  } catch (e) {
    if (e instanceof RejectError) return reply.code(409).send({ result: 'rejected_out_of_seq' as ScanResult, reason: e.message, label: job.displayLabel })
    return handleTxError(e, reply, job.displayLabel, body.idempotencyKey)
  }
}

class RejectError extends Error {}

async function bumpStep(tx: Prisma.TransactionClient, id: string, version: number, data: Prisma.JobStepUpdateManyMutationInput) {
  const r = await tx.jobStep.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } })
  if (r.count !== 1) throw new ConflictError()
}

async function bumpJob(tx: Prisma.TransactionClient, id: string, version: number, status: JobStatus) {
  const r = await tx.job.updateMany({ where: { id, version }, data: { status, version: { increment: 1 } } })
  if (r.count !== 1) throw new ConflictError()
}

async function handleTxError(e: unknown, reply: FastifyReply, label: string, idempotencyKey: string) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    // a retried physical scan (same key) → replay the prior recorded result
    const prev = await prisma.scanEvent.findUnique({ where: { idempotencyKey }, select: { result: true } }).catch(() => null)
    return reply.code(200).send({ result: prev?.result ?? ('duplicate' as ScanResult), replayed: true, label })
  }
  if (e instanceof ConflictError) return reply.code(409).send({ result: 'superseded' as ScanResult, reason: 'concurrent_scan', label })
  throw e
}
