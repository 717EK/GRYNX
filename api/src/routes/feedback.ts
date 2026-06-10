import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole, type AccessPayload } from '../lib/auth.js'
import { writeAudit } from '../lib/audit.js'

const KIND = z.enum(['bug', 'idea', 'feedback'])
const SEVERITY = z.enum(['low', 'normal', 'high', 'critical'])

const createSchema = z.object({
  kind: KIND.default('bug'),
  severity: SEVERITY.default('normal'),
  screen: z.string().max(80).optional(),
  remark: z.string().min(1).max(4000),
  context: z.record(z.any()).optional(),
  screenshot: z.string().max(8_000_000).optional(), // base64 data URL, capped ~8MB
  image: z.string().max(8_000_000).optional(), // user-attached image
  audio: z.string().max(12_000_000).optional(), // voice note
})

// In-app feedback / bug reporter. Any signed-in user can file; admins triage.
export async function feedbackRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  // anyone signed in can file a report
  app.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request', detail: parsed.error.issues })
    const user = req.user as AccessPayload
    const fb = await prisma.feedback.create({
      data: {
        kind: parsed.data.kind,
        severity: parsed.data.severity,
        screen: parsed.data.screen ?? null,
        remark: parsed.data.remark,
        context: parsed.data.context ?? {},
        screenshot: parsed.data.screenshot ?? null,
        image: parsed.data.image ?? null,
        audio: parsed.data.audio ?? null,
        createdById: user.sub,
        createdByName: user.username ?? null,
      },
      select: { id: true, severity: true },
    })
    await writeAudit('feedback', fb.id, 'create', { actorId: user.sub, after: { kind: parsed.data.kind, severity: parsed.data.severity, screen: parsed.data.screen } })
    return reply.code(201).send({ feedback: fb })
  })

  // ── admin triage views ──────────────────────────────────────────────────────
  // lightweight counts for the per-command summary
  app.get('/count', { preHandler: requireRole('admin') }, async () => {
    const [open, critical, total] = await Promise.all([
      prisma.feedback.count({ where: { status: 'open' } }),
      prisma.feedback.count({ where: { status: 'open', severity: 'critical' } }),
      prisma.feedback.count(),
    ])
    return { open, critical, total }
  })

  // list (screenshot omitted; use GET /:id for the full image)
  app.get('/', { preHandler: requireRole('admin') }, async (req) => {
    const q = z.object({ status: z.enum(['open', 'resolved']).optional() }).parse(req.query)
    const rows = await prisma.feedback.findMany({
      where: q.status ? { status: q.status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true, kind: true, severity: true, status: true, screen: true, remark: true,
        context: true, createdByName: true, createdAt: true, resolvedAt: true,
        screenshot: false,
      },
    })
    // flag which reports carry media so the UI can offer "view" (ids only — no blobs)
    const ids = rows.map((r) => r.id)
    const idsWhere = { id: { in: ids } }
    const [shot, img, aud] = ids.length
      ? await Promise.all([
          prisma.feedback.findMany({ where: { ...idsWhere, NOT: { screenshot: null } }, select: { id: true } }),
          prisma.feedback.findMany({ where: { ...idsWhere, NOT: { image: null } }, select: { id: true } }),
          prisma.feedback.findMany({ where: { ...idsWhere, NOT: { audio: null } }, select: { id: true } }),
        ])
      : [[], [], []]
    const sShot = new Set(shot.map((x) => x.id)), sImg = new Set(img.map((x) => x.id)), sAud = new Set(aud.map((x) => x.id))
    return { feedback: rows.map((r) => ({ ...r, hasScreenshot: sShot.has(r.id), hasImage: sImg.has(r.id), hasAudio: sAud.has(r.id) })) }
  })

  app.get('/:id', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const fb = await prisma.feedback.findUnique({ where: { id } })
    if (!fb) return reply.code(404).send({ error: 'not_found' })
    return { feedback: fb }
  })

  app.post('/:id/resolve', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ status: z.enum(['open', 'resolved']).default('resolved') }).parse(req.body ?? {})
    const actorId = (req.user as AccessPayload).sub
    await prisma.feedback.update({ where: { id }, data: { status: body.status, resolvedAt: body.status === 'resolved' ? new Date() : null } })
    await writeAudit('feedback', id, 'resolve', { actorId, after: { status: body.status } })
    return { ok: true }
  })

  app.post('/:id/severity', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.object({ severity: SEVERITY }).parse(req.body)
    const actorId = (req.user as AccessPayload).sub
    await prisma.feedback.update({ where: { id }, data: { severity: body.severity } })
    await writeAudit('feedback', id, 'set_severity', { actorId, after: { severity: body.severity } })
    return { ok: true }
  })
}
