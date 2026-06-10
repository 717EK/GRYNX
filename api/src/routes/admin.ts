import type { FastifyInstance } from 'fastify'
import { JobStatus } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { authenticate, requireRole } from '../lib/auth.js'

const ACTIVE: JobStatus[] = [JobStatus.approved, JobStatus.in_production, JobStatus.in_qc, JobStatus.in_fg, JobStatus.close_requested]

// Aggregated control-centre stats — computed in the DB so it scales past a board.
export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/stats', { preHandler: requireRole('admin') }, async () => {
    const since = new Date(Date.now() - 13 * 86400_000)
    since.setHours(0, 0, 0, 0)

    const [statusGroups, productGroups, maintGroups, wip, openTickets, recent, products] = await Promise.all([
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
      },
      statusMix,
      byProduct,
      throughput: days.map((d) => ({ day: d.day, created: d.created, closed: d.closed })),
      maintenance,
    }
  })
}
