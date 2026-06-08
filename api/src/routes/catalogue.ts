import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { authenticate } from '../lib/auth.js'

// Read-only reference data for the create-job form and department views.
export async function catalogueRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate)

  app.get('/departments', async () => {
    const departments = await prisma.department.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, name: true, sortOrder: true },
    })
    return { departments }
  })

  app.get('/products', async () => {
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      include: {
        models: { where: { active: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true } },
        pipelines: {
          orderBy: { isDefault: 'desc' },
          include: {
            steps: {
              orderBy: { sequence: 'asc' },
              select: { sequence: true, department: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    })
    return { products }
  })

  app.get('/hold-reasons', async () => {
    const reasons = await prisma.holdReason.findMany({
      where: { active: true },
      select: { code: true, label: true },
    })
    return { reasons }
  })
}
