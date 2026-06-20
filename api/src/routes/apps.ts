import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'

// App Studio (docs/13) — the visual app platform. An app is versioned metadata
// (definition JSON: entities/flows/pages); AppRecord is the generic row store.
// ENTIRELY SuperUser-only and isolated from the live GRYNX models.

type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'select' | 'relation' | 'json' | 'file'
interface Field { key: string; name: string; type: FieldType; required?: boolean; unique?: boolean; options?: string[]; to?: string; many?: boolean; default?: unknown }
interface Entity { key: string; name: string; fields: Field[]; storage?: { kind: string } }
interface AppDefinition { entities?: Entity[]; flows?: unknown[]; pages?: unknown[]; connectors?: unknown[]; graph?: unknown }

const fieldSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().min(1).max(60),
  type: z.enum(['text', 'number', 'boolean', 'date', 'datetime', 'select', 'relation', 'json', 'file']),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  to: z.string().optional(),
  many: z.boolean().optional(),
  default: z.unknown().optional(),
})
const entitySchema = z.object({ key: z.string().min(1).max(40), name: z.string().min(1).max(60), fields: z.array(fieldSchema), storage: z.object({ kind: z.string() }).optional() })
const definitionSchema = z.object({ entities: z.array(entitySchema).optional(), flows: z.array(z.unknown()).optional(), pages: z.array(z.unknown()).optional(), connectors: z.array(z.unknown()).optional(), graph: z.unknown().optional() }).passthrough()

// validate a record payload against an entity's field list; returns cleaned data
function validateRecord(entity: Entity, data: Record<string, unknown>, mode: 'create' | 'update'): { errors: string[]; clean: Record<string, unknown> } {
  const errors: string[] = []
  const clean: Record<string, unknown> = {}
  for (const f of entity.fields) {
    let v = data[f.key]
    const empty = v === undefined || v === null || v === ''
    if (empty) {
      if (mode === 'create' && f.default !== undefined) v = f.default
      else if (mode === 'create' && f.required) { errors.push(`${f.name} is required`); continue }
      else { if (v !== undefined && f.key in data) clean[f.key] = v; continue }
    }
    switch (f.type) {
      case 'number': { const n = Number(v); if (Number.isNaN(n)) errors.push(`${f.name} must be a number`); else v = n; break }
      case 'boolean': v = !!v; break
      case 'select': if (f.options && !f.options.includes(String(v))) errors.push(`${f.name} must be one of: ${f.options.join(', ')}`); break
      default: break // text/date/datetime/relation(id)/json/file stored as-is
    }
    clean[f.key] = v
  }
  return { errors, clean }
}

export async function appsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)
  // The App Studio is the developer's platform — SuperUser only, on every route.
  app.addHook('preHandler', async (req, reply) => {
    if ((req.user as AccessPayload).username !== 'admin') return reply.code(403).send({ error: 'superuser_only' })
  })

  const getApp = (key: string) => prisma.app.findUnique({ where: { key } })
  // the active schema: published version's definition, else the latest version's
  async function activeDefinition(appId: string): Promise<{ versionId: string; def: AppDefinition } | null> {
    const a = await prisma.app.findUnique({ where: { id: appId }, select: { publishedVersionId: true } })
    let ver = a?.publishedVersionId ? await prisma.appVersion.findUnique({ where: { id: a.publishedVersionId }, select: { id: true, definition: true } }) : null
    if (!ver) ver = await prisma.appVersion.findFirst({ where: { appId }, orderBy: { version: 'desc' }, select: { id: true, definition: true } })
    return ver ? { versionId: ver.id, def: (ver.definition as AppDefinition) ?? {} } : null
  }

  // ── apps ──────────────────────────────────────────────────────────────────
  app.get('/', async () => {
    const apps = await prisma.app.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, key: true, name: true, isActive: true, publishedVersionId: true, _count: { select: { versions: true, records: true } } } })
    return { apps }
  })

  app.post('/', async (req, reply) => {
    const body = z.object({ key: z.string().min(2).max(40).regex(/^[a-z][a-z0-9_]*$/, 'lowercase letters, digits, underscore'), name: z.string().min(1).max(80) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues[0]?.message })
    const actorId = (req.user as AccessPayload).sub
    if (await getApp(body.data.key)) return reply.code(409).send({ error: 'key_taken' })
    const created = await prisma.app.create({
      data: { key: body.data.key, name: body.data.name, createdById: actorId, versions: { create: { version: 1, status: 'draft', definition: { entities: [], flows: [], pages: [], connectors: [] }, createdById: actorId } } },
      include: { versions: true },
    })
    await writeAudit('app', created.id, 'create', { actorId, after: { key: body.data.key } })
    return reply.code(201).send({ app: created })
  })

  app.get('/:appKey', async (req, reply) => {
    const { appKey } = z.object({ appKey: z.string() }).parse(req.params)
    const a = await prisma.app.findUnique({ where: { key: appKey }, include: { publishedVersion: true } })
    if (!a) return reply.code(404).send({ error: 'not_found' })
    return { app: { id: a.id, key: a.key, name: a.name, isActive: a.isActive, publishedVersionId: a.publishedVersionId }, published: a.publishedVersion ? { id: a.publishedVersion.id, version: a.publishedVersion.version, definition: a.publishedVersion.definition } : null }
  })

  app.get('/:appKey/versions', async (req, reply) => {
    const { appKey } = z.object({ appKey: z.string() }).parse(req.params)
    const a = await getApp(appKey)
    if (!a) return reply.code(404).send({ error: 'not_found' })
    const versions = await prisma.appVersion.findMany({ where: { appId: a.id }, orderBy: { version: 'desc' } })
    return { appId: a.id, publishedVersionId: a.publishedVersionId, versions }
  })

  app.post('/:appKey/versions', async (req, reply) => {
    const { appKey } = z.object({ appKey: z.string() }).parse(req.params)
    const body = z.object({ note: z.string().max(300).optional(), definition: definitionSchema }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const a = await getApp(appKey)
    if (!a) return reply.code(404).send({ error: 'not_found' })
    const actorId = (req.user as AccessPayload).sub
    const max = await prisma.appVersion.aggregate({ where: { appId: a.id }, _max: { version: true } })
    const created = await prisma.appVersion.create({ data: { appId: a.id, version: (max._max.version ?? 0) + 1, status: 'draft', note: body.data.note ?? null, definition: body.data.definition as object, createdById: actorId } })
    return reply.code(201).send({ version: created })
  })

  app.patch('/:appKey/versions/:id', async (req, reply) => {
    const { appKey, id } = z.object({ appKey: z.string(), id: z.string().uuid() }).parse(req.params)
    const body = z.object({ note: z.string().max(300).optional(), definition: definitionSchema }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'bad_request', detail: body.error.issues })
    const a = await getApp(appKey); if (!a) return reply.code(404).send({ error: 'not_found' })
    const ver = await prisma.appVersion.findFirst({ where: { id, appId: a.id }, select: { status: true } })
    if (!ver) return reply.code(404).send({ error: 'not_found' })
    if (ver.status !== 'draft') return reply.code(409).send({ error: 'not_draft', hint: 'publish a new version to change a live app' })
    const updated = await prisma.appVersion.update({ where: { id }, data: { note: body.data.note ?? null, definition: body.data.definition as object } })
    return { version: updated }
  })

  app.post('/:appKey/versions/:id/publish', async (req, reply) => {
    const { appKey, id } = z.object({ appKey: z.string(), id: z.string().uuid() }).parse(req.params)
    const a = await getApp(appKey); if (!a) return reply.code(404).send({ error: 'not_found' })
    const ver = await prisma.appVersion.findFirst({ where: { id, appId: a.id } })
    if (!ver) return reply.code(404).send({ error: 'not_found' })
    if (a.publishedVersionId === id) return reply.code(409).send({ error: 'already_published' })
    const actorId = (req.user as AccessPayload).sub
    const rollback = ver.status === 'archived'
    await prisma.$transaction(async (tx) => {
      if (a.publishedVersionId) await tx.appVersion.update({ where: { id: a.publishedVersionId }, data: { status: 'archived' } })
      await tx.appVersion.update({ where: { id }, data: { status: 'published', publishedAt: new Date() } })
      await tx.app.update({ where: { id: a.id }, data: { publishedVersionId: id } })
      await writeAudit('app_version', id, rollback ? 'rollback' : 'publish', { actorId, tx })
    })
    return { ok: true, publishedVersionId: id, rolledBack: rollback }
  })

  app.delete('/:appKey/versions/:id', async (req, reply) => {
    const { appKey, id } = z.object({ appKey: z.string(), id: z.string().uuid() }).parse(req.params)
    const a = await getApp(appKey); if (!a) return reply.code(404).send({ error: 'not_found' })
    const ver = await prisma.appVersion.findFirst({ where: { id, appId: a.id }, select: { status: true } })
    if (!ver) return reply.code(404).send({ error: 'not_found' })
    if (ver.status !== 'draft') return reply.code(409).send({ error: 'not_draft' })
    await prisma.appVersion.delete({ where: { id } })
    return { ok: true }
  })

  // ── data engine (auto-CRUD over AppRecord, driven by the entity schema) ─────
  async function resolveEntity(appKey: string, entityKey: string) {
    const a = await getApp(appKey); if (!a) return { err: 'app_not_found' as const }
    const active = await activeDefinition(a.id); if (!active) return { err: 'no_version' as const }
    const entity = (active.def.entities ?? []).find((e) => e.key === entityKey)
    if (!entity) return { err: 'entity_not_found' as const }
    return { appId: a.id, entity }
  }

  app.get('/:appKey/data/:entityKey', async (req, reply) => {
    const { appKey, entityKey } = z.object({ appKey: z.string(), entityKey: z.string() }).parse(req.params)
    const r = await resolveEntity(appKey, entityKey)
    if ('err' in r) return reply.code(404).send({ error: r.err })
    const rows = await prisma.appRecord.findMany({ where: { appId: r.appId, entityKey }, orderBy: { createdAt: 'desc' }, take: 500 })
    return { entity: { key: r.entity.key, name: r.entity.name, fields: r.entity.fields }, records: rows.map((x) => ({ id: x.id, ...(x.data as object), _createdAt: x.createdAt, _version: x.version })) }
  })

  app.post('/:appKey/data/:entityKey', async (req, reply) => {
    const { appKey, entityKey } = z.object({ appKey: z.string(), entityKey: z.string() }).parse(req.params)
    const r = await resolveEntity(appKey, entityKey)
    if ('err' in r) return reply.code(404).send({ error: r.err })
    const { errors, clean } = validateRecord(r.entity, (req.body ?? {}) as Record<string, unknown>, 'create')
    if (errors.length) return reply.code(400).send({ error: 'validation', errors })
    for (const f of r.entity.fields.filter((x) => x.unique)) {
      if (clean[f.key] === undefined) continue
      const dup = await prisma.appRecord.findFirst({ where: { appId: r.appId, entityKey, data: { path: [f.key], equals: clean[f.key] as never } }, select: { id: true } })
      if (dup) return reply.code(409).send({ error: 'duplicate', field: f.key, hint: `${f.name} must be unique` })
    }
    const actorId = (req.user as AccessPayload).sub
    const rec = await prisma.appRecord.create({ data: { appId: r.appId, entityKey, data: clean as object, createdById: actorId } })
    return reply.code(201).send({ record: { id: rec.id, ...(rec.data as object) } })
  })

  app.get('/:appKey/data/:entityKey/:id', async (req, reply) => {
    const { appKey, entityKey, id } = z.object({ appKey: z.string(), entityKey: z.string(), id: z.string().uuid() }).parse(req.params)
    const r = await resolveEntity(appKey, entityKey)
    if ('err' in r) return reply.code(404).send({ error: r.err })
    const rec = await prisma.appRecord.findFirst({ where: { id, appId: r.appId, entityKey } })
    if (!rec) return reply.code(404).send({ error: 'not_found' })
    return { record: { id: rec.id, ...(rec.data as object) } }
  })

  app.patch('/:appKey/data/:entityKey/:id', async (req, reply) => {
    const { appKey, entityKey, id } = z.object({ appKey: z.string(), entityKey: z.string(), id: z.string().uuid() }).parse(req.params)
    const r = await resolveEntity(appKey, entityKey)
    if ('err' in r) return reply.code(404).send({ error: r.err })
    const rec = await prisma.appRecord.findFirst({ where: { id, appId: r.appId, entityKey } })
    if (!rec) return reply.code(404).send({ error: 'not_found' })
    const { errors, clean } = validateRecord(r.entity, (req.body ?? {}) as Record<string, unknown>, 'update')
    if (errors.length) return reply.code(400).send({ error: 'validation', errors })
    for (const f of r.entity.fields.filter((x) => x.unique)) {
      if (clean[f.key] === undefined) continue
      const dup = await prisma.appRecord.findFirst({ where: { appId: r.appId, entityKey, id: { not: id }, data: { path: [f.key], equals: clean[f.key] as never } }, select: { id: true } })
      if (dup) return reply.code(409).send({ error: 'duplicate', field: f.key })
    }
    const merged = { ...(rec.data as object), ...clean }
    const updated = await prisma.appRecord.update({ where: { id }, data: { data: merged as object, version: { increment: 1 } } })
    return { record: { id: updated.id, ...(updated.data as object) } }
  })

  app.delete('/:appKey/data/:entityKey/:id', async (req, reply) => {
    const { appKey, entityKey, id } = z.object({ appKey: z.string(), entityKey: z.string(), id: z.string().uuid() }).parse(req.params)
    const r = await resolveEntity(appKey, entityKey)
    if ('err' in r) return reply.code(404).send({ error: r.err })
    const del = await prisma.appRecord.deleteMany({ where: { id, appId: r.appId, entityKey } })
    if (del.count === 0) return reply.code(404).send({ error: 'not_found' })
    return { ok: true }
  })
}
