import { Prisma } from '@prisma/client'
import { prisma } from './prisma.js'
import { writeAudit } from './audit.js'
import { notifyDepartment } from './notify.js'
import { nextDailySequence } from './sequence.js'
import { buildDisplayLabel, dailyScope, opaqueJobNo } from './label.js'
import { acceptanceDueAt } from './sla.js'

export interface JobCreateInput {
  productId: string
  priority: 'normal' | 'urgent'
  jobType?: 'production' | 'rework'
  pipelineTemplateId?: string
  startDate?: Date | null
  reworkIssue?: string | null
  reworkEntryDepartmentId?: string | null
  models: { modelId: string; size?: string | null; quantity: number }[]
}

type JobWithSteps = Prisma.JobGetPayload<{ include: { steps: true } }>
export type JobCreateResult =
  | { ok: false; status: number; error: string }
  | { ok: true; job: JobWithSteps }

// Shared job-creation transaction: used by admin Create Job AND PPC approval.
// source = 'admin' (direct) or 'ppc' (approved request); ppcRequestId links back.
export async function createJobFromInput(
  input: JobCreateInput,
  opts: { actorId: string; source: 'admin' | 'ppc'; ppcRequestId?: string },
): Promise<JobCreateResult> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { models: { select: { id: true } } },
  })
  if (!product) return { ok: false, status: 404, error: 'product_not_found' }
  const allowed = new Set(product.models.map((m) => m.id))
  if (input.models.some((m) => !allowed.has(m.modelId))) return { ok: false, status: 400, error: 'model_not_in_product' }

  const template = input.pipelineTemplateId
    ? await prisma.pipelineTemplate.findFirst({
        where: { id: input.pipelineTemplateId, productId: product.id },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      })
    : await prisma.pipelineTemplate.findFirst({
        where: { productId: product.id, isDefault: true },
        include: { steps: { orderBy: { sequence: 'asc' } } },
      })
  if (!template || template.steps.length === 0) return { ok: false, status: 400, error: 'no_pipeline' }

  const jobType = input.jobType ?? 'production'
  if (jobType === 'rework' && !input.reworkEntryDepartmentId) return { ok: false, status: 400, error: 'rework_entry_required' }

  const totalQty = input.models.reduce((s, m) => s + m.quantity, 0)
  const now = new Date()
  const firstStepDue = await acceptanceDueAt(now)
  const firstDeptId = template.steps[0].departmentId

  const create = () =>
    prisma.$transaction(
      async (tx) => {
        const seq = await nextDailySequence(tx, dailyScope(product.code, now))
        const displayLabel = buildDisplayLabel(product.code, input.priority, totalQty, now, seq)
        const jobNo = opaqueJobNo()
        const job = await tx.job.create({
          data: {
            jobNo,
            displayLabel,
            jobType,
            productId: product.id,
            priority: input.priority,
            totalQty,
            status: 'in_production',
            pipelineTemplateId: template.id,
            source: opts.source,
            ppcRequestId: opts.ppcRequestId ?? null,
            createdById: opts.actorId,
            startDate: input.startDate ?? null,
            reworkIssue: input.reworkIssue ?? null,
            reworkEntryDepartmentId: input.reworkEntryDepartmentId ?? null,
            models: { create: input.models.map((m) => ({ modelId: m.modelId, size: m.size ?? null, quantity: m.quantity })) },
            steps: {
              create: template.steps.map((s, i) => ({
                departmentId: s.departmentId,
                sequence: s.sequence,
                status: i === 0 ? 'waiting_acceptance' : 'pending',
                slaDueAt: i === 0 ? firstStepDue : null,
              })),
            },
          },
          include: { steps: { orderBy: { sequence: 'asc' } } },
        })
        await tx.jobEvent.create({
          data: { jobId: job.id, type: 'created', actorId: opts.actorId, body: displayLabel, meta: { totalQty, source: opts.source } },
        })
        await writeAudit('job', job.id, 'create', { actorId: opts.actorId, after: { jobNo, displayLabel, source: opts.source }, tx })
        await notifyDepartment(tx, firstDeptId, { type: 'new_job', jobId: job.id, body: `New job ${displayLabel} arriving` })
        return job
      },
      { timeout: 20_000, maxWait: 5_000 },
    )

  try {
    return { ok: true, job: await create() }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, job: await create() }
    throw e
  }
}
