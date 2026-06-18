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
  name?: string | null
  jobType?: 'production' | 'rework'
  pipelineTemplateId?: string
  orderId?: string | null // order-layer: the sales order this job fulfils
  orderItemId?: string | null // which order line-item
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

  // workflow-engine (docs/12): jobs snapshot the PUBLISHED company workflow version
  // when one exists; the per-product pipeline template is the legacy fallback. Only
  // department-backed stages (with a departmentId) become JobSteps — non-department
  // business stages (sales/dispatch) are handled by later phases, not as steps.
  const def = await prisma.workflowDefinition.findFirst({
    where: { isActive: true, publishedVersionId: { not: null } },
    select: {
      publishedVersionId: true,
      publishedVersion: { select: { id: true, stages: { where: { departmentId: { not: null } }, orderBy: { sequence: 'asc' }, select: { departmentId: true, stageType: true } } } },
    },
  })
  const wfStages = def?.publishedVersion?.stages ?? []

  // fallback path: legacy per-product pipeline template
  const template =
    wfStages.length > 0
      ? null
      : input.pipelineTemplateId
        ? await prisma.pipelineTemplate.findFirst({ where: { id: input.pipelineTemplateId, productId: product.id }, include: { steps: { orderBy: { sequence: 'asc' } } } })
        : await prisma.pipelineTemplate.findFirst({ where: { productId: product.id, isDefault: true }, include: { steps: { orderBy: { sequence: 'asc' } } } })

  // the steps to snapshot — from the workflow version (preferred) or the template
  const stepSpecs =
    wfStages.length > 0
      ? wfStages.map((s, i) => ({ departmentId: s.departmentId!, stageType: s.stageType, sequence: (i + 1) * 10 }))
      : (template?.steps ?? []).map((s) => ({ departmentId: s.departmentId, stageType: null as null, sequence: s.sequence }))
  if (stepSpecs.length === 0) return { ok: false, status: 400, error: 'no_pipeline' }

  // a job always needs a pipelineTemplateId (non-null FK) for back-compat; use the
  // product default even on the workflow path (it's not used to build steps there).
  const templateIdForJob =
    template?.id ?? (await prisma.pipelineTemplate.findFirst({ where: { productId: product.id, isDefault: true }, select: { id: true } }))?.id
  if (!templateIdForJob) return { ok: false, status: 400, error: 'no_pipeline' }

  const jobType = input.jobType ?? 'production'
  if (jobType === 'rework' && !input.reworkEntryDepartmentId) return { ok: false, status: 400, error: 'rework_entry_required' }

  const totalQty = input.models.reduce((s, m) => s + m.quantity, 0)
  const now = new Date()
  const firstStepDue = await acceptanceDueAt(now)
  const firstDeptId = stepSpecs[0].departmentId
  const workflowVersionId = def?.publishedVersionId ?? null

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
            name: input.name?.trim() || null,
            jobType,
            productId: product.id,
            priority: input.priority,
            totalQty,
            status: 'in_production',
            pipelineTemplateId: templateIdForJob,
            workflowVersionId,
            orderId: input.orderId ?? null,
            orderItemId: input.orderItemId ?? null,
            source: opts.source,
            ppcRequestId: opts.ppcRequestId ?? null,
            createdById: opts.actorId,
            startDate: input.startDate ?? null,
            reworkIssue: input.reworkIssue ?? null,
            reworkEntryDepartmentId: input.reworkEntryDepartmentId ?? null,
            models: { create: input.models.map((m) => ({ modelId: m.modelId, size: m.size ?? null, quantity: m.quantity })) },
            steps: {
              create: stepSpecs.map((s, i) => ({
                departmentId: s.departmentId,
                stageType: s.stageType,
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
