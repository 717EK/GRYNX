import type { FastifyInstance } from 'fastify'
import { Prisma, type JobStatus, type ScanResult } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'
import { resolveStation } from '../lib/station.js'
import { writeAudit } from '../lib/audit.js'
import { notifyDepartment } from '../lib/notify.js'
import { stationDueAt, acceptanceDueAt } from '../lib/sla.js'

const scanSchema = z.object({
  jobNo: z.string().min(4).max(40), // the scanned code: display label OR opaque jobNo
  idempotencyKey: z.string().uuid(), // one per physical scan; dedups retries
  clientTs: z.coerce.date(), // when the scan physically happened (offline-safe)
  stationDepartmentId: z.string().uuid().optional(), // only for multi-station users
  note: z.string().max(500).optional(),
  force: z.boolean().default(false), // supervisor override of out-of-sequence
  preview: z.boolean().default(false), // dry-run for the 1-tap confirm UX
})

type StepRow = {
  id: string
  sequence: number
  status: string
  version: number
  departmentId: string
  department: { code: string; name: string }
}

// Map the station that just went in_progress to the job-level status.
function jobStatusFor(deptCode: string): JobStatus {
  if (deptCode === 'QC') return 'in_qc'
  if (deptCode === 'FG_STOCK') return 'in_fg'
  return 'in_production'
}

class ConflictError extends Error {}

export async function scanRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.post('/', async (req, reply) => {
    const parsed = scanSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const body = parsed.data
    const user = req.user as AccessPayload

    // 1. station from auth, never from the payload
    const station = resolveStation(user, body.stationDepartmentId)
    if (!station.ok) {
      return reply.code(station.reason === 'ambiguous' ? 409 : 403).send({
        error: station.reason === 'ambiguous' ? 'station_ambiguous' : 'no_station',
        options: station.options,
      })
    }
    const stationDeptId = station.departmentId

    // 2. load job + live steps. The scanned code is the display label (barcode)
    // or the opaque jobNo — accept either.
    const code = body.jobNo.trim()
    const job = await prisma.job.findFirst({
      where: { OR: [{ jobNo: code }, { displayLabel: code }] },
      select: {
        id: true,
        displayLabel: true,
        status: true,
        totalQty: true,
        version: true,
        steps: {
          orderBy: { sequence: 'asc' },
          select: {
            id: true,
            sequence: true,
            status: true,
            version: true,
            departmentId: true,
            department: { select: { code: true, name: true } },
          },
        },
      },
    })
    if (!job) return reply.code(404).send({ error: 'job_not_found' })
    if (job.status === 'closed' || job.status === 'cancelled')
      return reply.code(409).send({ error: 'job_terminal', status: job.status })

    const steps = job.steps as StepRow[]

    // 3. decide (pure): which step does this station scan act on?
    const scanned = steps.find(
      (s) => s.departmentId === stationDeptId && s.status !== 'completed' && s.status !== 'skipped',
    )
    if (!scanned) {
      // station not in pipeline, or already passed
      const result: ScanResult = 'rejected_out_of_seq'
      if (!body.preview) await recordReject(body, job.id, stationDeptId, user.sub, result)
      return reply.code(409).send({ result, reason: 'station_not_pending_for_job', label: job.displayLabel })
    }
    if (scanned.status === 'in_progress') {
      return reply.send({ result: 'duplicate' as ScanResult, reason: 'already_in_progress', label: job.displayLabel })
    }
    const arrivable = scanned.status === 'waiting_acceptance'
    if (!arrivable && !body.force) {
      const result: ScanResult = 'rejected_out_of_seq'
      if (!body.preview) await recordReject(body, job.id, stationDeptId, user.sub, result)
      return reply.code(409).send({
        result,
        reason: 'job_has_not_arrived',
        label: job.displayLabel,
        hint: 'previous stations not complete — supervisor can force',
      })
    }
    // supervisor gate: only an admin (supervisor) may force an out-of-sequence advance
    if (!arrivable && body.force) {
      const isSupervisor = (user.roles ?? []).some((r) => r.role === 'admin')
      if (!isSupervisor) {
        const result: ScanResult = 'rejected_out_of_seq'
        if (!body.preview) await recordReject(body, job.id, stationDeptId, user.sub, result)
        return reply.code(403).send({
          result,
          reason: 'force_requires_supervisor',
          label: job.displayLabel,
          hint: 'A supervisor must approve this force-advance',
        })
      }
    }

    const prior = steps.find((s) => s.status === 'in_progress') ?? null
    const next = steps.find((s) => s.sequence > scanned.sequence && s.status === 'pending') ?? null
    const resultCode: ScanResult = arrivable ? 'applied' : 'forced'

    // 3b. preview / dry-run — no writes, drives the confirm dialog
    if (body.preview) {
      return reply.send({
        result: resultCode,
        preview: true,
        label: job.displayLabel,
        from: prior?.department.name ?? null,
        to: scanned.department.name,
        completes: prior ? prior.department.name : null,
      })
    }

    // 4. one transaction — idempotent + optimistic-locked (docs/10 §4)
    try {
      const out = await prisma.$transaction(
        async (tx) => {
          // idempotency: this insert is FIRST. A retried physical scan (same
          // key) hits the UNIQUE constraint -> P2002 -> we replay the prior result.
          await tx.scanEvent.create({
            data: {
              jobId: job.id,
              stationDepartmentId: stationDeptId,
              scannedById: user.sub,
              clientTs: body.clientTs,
              idempotencyKey: body.idempotencyKey,
              result: resultCode,
              note: body.note ?? null,
            },
          })

          const bump = async (id: string, version: number, data: Prisma.JobStepUpdateManyMutationInput) => {
            const r = await tx.jobStep.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } })
            if (r.count !== 1) throw new ConflictError() // a concurrent scan won
          }

          // complete the prior in-progress step (attributed to this scanner, at scan time)
          if (prior) {
            await bump(prior.id, prior.version, {
              status: 'completed',
              completedAt: body.clientTs,
              completedById: user.sub,
            })
            await tx.jobEvent.create({ data: { jobId: job.id, jobStepId: prior.id, type: 'completed', actorId: user.sub, body: prior.department.name } })
          }

          // start the scanned step
          await bump(scanned.id, scanned.version, {
            status: 'in_progress',
            acceptedAt: body.clientTs,
            acceptedById: user.sub,
            slaDueAt: await stationDueAt(job.totalQty, body.clientTs),
          })

          // arm + notify the next station so its head sees the job coming
          if (next) {
            await bump(next.id, next.version, { status: 'waiting_acceptance', slaDueAt: await acceptanceDueAt() })
            await notifyDepartment(tx, next.departmentId, {
              type: 'new_job',
              jobId: job.id,
              body: `${job.displayLabel} arriving at ${next.department.name}`,
            })
          }

          const newStatus = jobStatusFor(scanned.department.code)
          const j = await tx.job.updateMany({
            where: { id: job.id, version: job.version },
            data: { status: newStatus, version: { increment: 1 } },
          })
          if (j.count !== 1) throw new ConflictError()

          await tx.jobEvent.create({
            data: { jobId: job.id, jobStepId: scanned.id, type: arrivable ? 'accepted' : 'forced_advance', actorId: user.sub, body: scanned.department.name },
          })
          await writeAudit('job_step', scanned.id, arrivable ? 'scan_advance' : 'forced_advance', {
            actorId: user.sub,
            before: { scanned: scanned.status, prior: prior?.status ?? null },
            after: { scanned: 'in_progress', priorCompleted: !!prior, jobStatus: newStatus },
            tx,
          })

          return { result: resultCode, label: job.displayLabel, station: scanned.department.name, completed: prior?.department.name ?? null, jobStatus: newStatus }
        },
        { timeout: 20_000, maxWait: 5_000 },
      )
      return reply.code(200).send(out)
    } catch (e) {
      // duplicate physical scan → replay prior result, change nothing
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const prev = await prisma.scanEvent.findUnique({ where: { idempotencyKey: body.idempotencyKey }, select: { result: true } })
        return reply.code(200).send({ result: prev?.result ?? ('duplicate' as ScanResult), replayed: true, label: job.displayLabel })
      }
      // optimistic-lock loss → a concurrent scan already advanced this job
      if (e instanceof ConflictError) {
        return reply.code(409).send({ result: 'superseded' as ScanResult, reason: 'concurrent_advance', label: job.displayLabel })
      }
      throw e
    }
  })
}

// A rejected scan is still recorded (audit trail of attempts), deduped by key.
async function recordReject(
  body: { jobNo: string; idempotencyKey: string; clientTs: Date; note?: string },
  jobId: string,
  stationDeptId: string,
  userId: string,
  result: ScanResult,
) {
  await prisma.scanEvent
    .create({
      data: {
        jobId,
        stationDepartmentId: stationDeptId,
        scannedById: userId,
        clientTs: body.clientTs,
        idempotencyKey: body.idempotencyKey,
        result,
        note: body.note ?? null,
      },
    })
    .catch(() => {}) // duplicate key on a retried reject — fine
}
