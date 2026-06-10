// Reset to a zero-data starting point: wipes all TRANSACTIONAL data (jobs, PPC
// requests, maintenance, serials, materials, notifications, scans, audit) but
// KEEPS the configuration (users, roles, products, models, pipelines,
// departments, settings, device/biometric registrations).
// Run:  node --env-file=.env scripts/reset-data.mjs
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const steps = [
  ['scanEvent', () => prisma.scanEvent.deleteMany()],
  ['hold', () => prisma.hold.deleteMany()],
  ['attachment', () => prisma.attachment.deleteMany()],
  ['qcInspection', () => prisma.qcInspection.deleteMany()],
  ['closure', () => prisma.closure.deleteMany()],
  ['jobEvent', () => prisma.jobEvent.deleteMany()],
  ['materialUsage', () => prisma.materialUsage.deleteMany()],
  ['serial', () => prisma.serial.deleteMany()],
  ['jobModel', () => prisma.jobModel.deleteMany()],
  ['jobStep', () => prisma.jobStep.deleteMany()],
  ['ppcRequestModel', () => prisma.ppcRequestModel.deleteMany()],
  ['maintenanceEvent', () => prisma.maintenanceEvent.deleteMany()],
  ['suggestion', () => prisma.suggestion.deleteMany()],
  ['notification', () => prisma.notification.deleteMany()],
  ['auditLog', () => prisma.auditLog.deleteMany()],
  ['job', () => prisma.job.deleteMany()],
  ['ppcRequest', () => prisma.ppcRequest.deleteMany()],
  ['maintenanceTicket', () => prisma.maintenanceTicket.deleteMany()],
  ['dailySequence', () => prisma.dailySequence.deleteMany()], // restart job/ticket/request numbers
]

;(async () => {
  console.log('Resetting GRYNX to zero data (keeping users/products/pipelines/departments/settings)…')
  for (const [name, fn] of steps) {
    try {
      const r = await fn()
      console.log(`  · cleared ${name}: ${r.count}`)
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message.slice(0, 80)}`)
    }
  }
  const users = await prisma.user.count()
  const products = await prisma.product.count()
  console.log(`\n✅ Reset complete. Kept ${users} users + ${products} products + pipelines/departments/settings.`)
  await prisma.$disconnect()
  process.exit(0)
})().catch(async (e) => { console.error('ERR', e.message); await prisma.$disconnect(); process.exit(1) })
