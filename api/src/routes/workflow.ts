import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'

// Workflow engine (docs/12). The company-wide business pipeline as versioned data.
// Reads are open to any authed user (the flow map / glance view); edits + publish
// are admin-only. Jobs snapshot the published version at creation (see jobCreate),
// so publishing a new version never re-routes in-flight jobs.

const stageSelect = {
  id: true,
  stageType: true,
  departmentId: true,
  label: true,
  sequence: true,
  config: true,
  department: { select: { code: true, name: true } },
} as const

async function activeDefinition() {
  let def = await prisma.workflowDefinition.findFirst({ where: { isActive: true } })
  if (!def) def = await prisma.workflowDefinition.create({ data: { name: 'GRYNX Factory Workflow' } })
  return def
}

export async function workflowRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // Editing the company workflow is the developer's job, not the factory owner's.
  // Reads stay admin-visible; all writes are locked to the SuperUser account.
  const requireSuper = async (req: { user?: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) => {
    if ((req.user as AccessPayload).username !== 'admin') return reply.code(403).send({ error: 'superuser_only', hint: 'workflow editing is restricted to the SuperUser' })
  }

  // the published workflow (for the flow map + job creation reference)
  app.get('/', async () => {
    const def = await prisma.workflowDefinition.findFirst({
      where: { isActive: true },
      include: {
        publishedVersion: { include: { stages: { orderBy: { sequence: 'asc' }, select: stageSelect } } },
      },
    })
    return {
      definition: def ? { id: def.id, name: def.name, publishedVersionId: def.publishedVersionId } : null,
      published: def?.publishedVersion
        ? { id: def.publishedVersion.id, version: def.publishedVersion.version, stages: def.publishedVersion.stages, graph: def.publishedVersion.graph }
        : null,
    }
  })

  // all versions (admin) — history + draft management
  app.get('/versions', { preHandler: requireRole('admin') }, async () => {
    const def = await activeDefinition()
    const versions = await prisma.workflowVersion.findMany({
      where: { definitionId: def.id },
      orderBy: { version: 'desc' },
      include: { stages: { orderBy: { sequence: 'asc' }, select: stageSelect } },
    })
    return { definitionId: def.id, publishedVersionId: def.publishedVersionId, versions }
  })

  const stageInput = z.object({
    stageType: z.enum(['sales', 'ppc_requirements', 'fg_check', 'design', 'ppc_final', 'production', 'qc', 'fg_stock', 'dispatch', 'maintenance']),
    departmentId: z.string().uuid().nullable().optional(),
    departmentCode: z.string().optional(), // convenience: resolved to departmentId
    label: z.string().min(1).max(60),
    config: z.record(z.unknown()).optional(),
  })
  type StageIn = z.infer<typeof stageInput>
  // stage types that BECOME job steps and need an owning department (jobCreate
  // snapshots these). Without a department a job would have an ownerless step.
  const DEPT_REQUIRED = new Set<StageIn['stageType']>(['design', 'production', 'qc', 'fg_stock'])

  // resolve departmentCode→Id for a stage list + assert dept-required stages have one
  async function resolveStages(stages: StageIn[]) {
    const codes = stages.map((s) => s.departmentCode).filter((c): c is string => !!c)
    const depts = codes.length ? await prisma.department.findMany({ where: { code: { in: codes } }, select: { id: true, code: true } }) : []
    const deptIdOf = (s: StageIn) => s.departmentId ?? (s.departmentCode ? depts.find((d) => d.code === s.departmentCode)?.id ?? null : null)
    const resolved = stages.map((s) => ({ stageType: s.stageType, departmentId: deptIdOf(s), label: s.label, config: (s.config ?? {}) as object }))
    const missing = resolved.find((s) => DEPT_REQUIRED.has(s.stageType) && !s.departmentId)
    return { resolved, missing }
  }

  // create a new DRAFT version (next version number) from an explicit stage list
  app.post('/versions', { preHandler: [requireRole('admin'), requireSuper] }, async (req, reply) => {
    const body = z.object({ note: z.string().max(300).optional(), stages: z.array(stageInput).min(1), graph: z.record(z.unknown()).optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const def = await activeDefinition()

    const { resolved, missing } = await resolveStages(body.data.stages)
    if (missing) return reply.code(400).send({ error: 'department_required', stageType: missing.stageType, hint: `a ${missing.stageType} stage needs a department` })

    const max = await prisma.workflowVersion.aggregate({ where: { definitionId: def.id }, _max: { version: true } })
    const nextVersion = (max._max.version ?? 0) + 1
    const created = await prisma.workflowVersion.create({
      data: {
        definitionId: def.id,
        version: nextVersion,
        status: 'draft',
        note: body.data.note ?? null,
        graph: (body.data.graph ?? {}) as object,
        createdById: actorId,
        stages: { create: resolved.map((s, i) => ({ stageType: s.stageType, departmentId: s.departmentId, label: s.label, sequence: (i + 1) * 10, config: s.config })) },
      },
      include: { stages: { orderBy: { sequence: 'asc' }, select: stageSelect } },
    })
    await writeAudit('workflow_version', created.id, 'create_draft', { actorId, after: { version: nextVersion, stages: created.stages.length } })
    return reply.code(201).send({ version: created })
  })

  // edit a DRAFT in place (replace its stage list). Published/archived are immutable —
  // to change a live flow you publish a new version (jobs already on the floor keep
  // their snapshot). Editing a draft repeatedly avoids version sprawl while designing.
  app.patch('/versions/:id', { preHandler: [requireRole('admin'), requireSuper] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ note: z.string().max(300).optional(), stages: z.array(stageInput).min(1), graph: z.record(z.unknown()).optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const actorId = (req.user as AccessPayload).sub
    const def = await activeDefinition()
    const ver = await prisma.workflowVersion.findFirst({ where: { id, definitionId: def.id }, select: { id: true, status: true } })
    if (!ver) return reply.code(404).send({ error: 'not_found' })
    if (ver.status !== 'draft') return reply.code(409).send({ error: 'not_draft', hint: 'only draft versions can be edited; publish a new version to change a live flow' })

    const { resolved, missing } = await resolveStages(body.data.stages)
    if (missing) return reply.code(400).send({ error: 'department_required', stageType: missing.stageType, hint: `a ${missing.stageType} stage needs a department` })

    const updated = await prisma.$transaction(async (tx) => {
      await tx.workflowStage.deleteMany({ where: { versionId: id } })
      await tx.workflowVersion.update({
        where: { id },
        data: { note: body.data.note ?? null, graph: (body.data.graph ?? {}) as object, stages: { create: resolved.map((s, i) => ({ stageType: s.stageType, departmentId: s.departmentId, label: s.label, sequence: (i + 1) * 10, config: s.config })) } },
      })
      return tx.workflowVersion.findUnique({ where: { id }, include: { stages: { orderBy: { sequence: 'asc' }, select: stageSelect } } })
    })
    await writeAudit('workflow_version', id, 'edit_draft', { actorId, after: { stages: body.data.stages.length } })
    return { version: updated }
  })

  // delete a DRAFT (never a published/archived version — those are the audit trail)
  app.delete('/versions/:id', { preHandler: [requireRole('admin'), requireSuper] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const def = await activeDefinition()
    const ver = await prisma.workflowVersion.findFirst({ where: { id, definitionId: def.id }, select: { id: true, status: true, _count: { select: { jobs: true } } } })
    if (!ver) return reply.code(404).send({ error: 'not_found' })
    if (ver.status !== 'draft') return reply.code(409).send({ error: 'not_draft' })
    if (ver._count.jobs > 0) return reply.code(409).send({ error: 'has_jobs', hint: 'a draft with jobs cannot be deleted' })
    await prisma.$transaction(async (tx) => {
      await tx.workflowStage.deleteMany({ where: { versionId: id } })
      await tx.workflowVersion.delete({ where: { id } })
    })
    await writeAudit('workflow_version', id, 'delete_draft', { actorId })
    return { ok: true }
  })

  // publish a version → it becomes the active workflow; the previous published one
  // is archived. Publishing a DRAFT = release; publishing an ARCHIVED version =
  // rollback (docs/12 safety: one-tap rollback to any version). In-flight jobs keep
  // their snapshot regardless (proven by the R5 test).
  app.post('/versions/:id/publish', { preHandler: [requireRole('admin'), requireSuper] }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const actorId = (req.user as AccessPayload).sub
    const def = await activeDefinition()
    const ver = await prisma.workflowVersion.findFirst({ where: { id, definitionId: def.id } })
    if (!ver) return reply.code(404).send({ error: 'not_found' })
    if (def.publishedVersionId === id) return reply.code(409).send({ error: 'already_published' })
    const rollback = ver.status === 'archived'

    await prisma.$transaction(async (tx) => {
      if (def.publishedVersionId) {
        await tx.workflowVersion.update({ where: { id: def.publishedVersionId }, data: { status: 'archived' } })
      }
      await tx.workflowVersion.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } })
      await tx.workflowDefinition.update({ where: { id: def.id }, data: { publishedVersionId: id } })
      await writeAudit('workflow_version', id, rollback ? 'rollback' : 'publish', { actorId, after: { version: ver.version }, tx })
    })
    return { ok: true, publishedVersionId: id, rolledBack: rollback }
  })
}
