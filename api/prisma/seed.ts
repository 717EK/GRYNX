import { PrismaClient } from '@prisma/client'
import { hashSecret } from '../src/lib/hash.js'

const prisma = new PrismaClient()

// Idempotent seed — safe to run repeatedly. Uses upserts on unique keys so it
// never duplicates and can extend an existing DB. Matches docs/02 seed list.

const DEPARTMENTS = [
  { code: 'DESIGN', name: 'Design', sortOrder: 10 },
  { code: 'PURCHASE', name: 'Purchase', sortOrder: 20 },
  { code: 'LASER', name: 'Laser / Cutting', sortOrder: 30 },
  { code: 'MS_PROD', name: 'MS Production', sortOrder: 40 },
  { code: 'ALLOY_PROD', name: 'Alloy Production', sortOrder: 50 },
  { code: 'CNC_VMC', name: 'CNC / VMC', sortOrder: 60 },
  { code: 'MNTR', name: 'MNTR', sortOrder: 70 },
  { code: 'POWDER', name: 'Powder Coat', sortOrder: 80 },
  { code: 'QC', name: 'QC', sortOrder: 90 },
  { code: 'FG_STOCK', name: 'FG Stock', sortOrder: 100 },
  { code: 'MAINT', name: 'Maintenance', sortOrder: 110 },
] as const

// HoldCode enum -> reasons surfaced in the UI hold dialog.
const HOLD_REASONS = [
  { code: 'material', label: 'Waiting on material' },
  { code: 'breakdown', label: 'Machine breakdown' },
  { code: 'approval', label: 'Awaiting approval' },
  { code: 'resource', label: 'No operator / resource' },
  { code: 'other', label: 'Other (see note)' },
] as const

// SLA base config consumed by the size-scaled rule (src/lib/insights.ts):
//   stationSlaHours(qty) = clamp(slaBaseHours + floor(qty / slaQtyPerHour), max slaMaxHours)
const SETTINGS: { key: string; value: unknown }[] = [
  { key: 'sla.baseHours', value: 2 },
  { key: 'sla.qtyPerHour', value: 25 },
  { key: 'sla.maxHours', value: 10 },
  { key: 'escalation.unacceptedHours', value: 2 }, // unaccepted past this -> backup -> admin
]

// Catalogue. AT290/AT400/AT500 are the models seen in the prototype JobForm.
// NOTE: the AT pipeline below is a *sensible default* — confirm the real
// per-product routing (docs/00 open item: Laser-vs-Laser+Cutting granularity).
const PRODUCTS = [
  {
    code: 'AT',
    name: 'AT Series',
    description: 'AT box-section production line',
    models: [
      { code: 'AT290', name: 'AT290' },
      { code: 'AT400', name: 'AT400' },
      { code: 'AT500', name: 'AT500' },
    ],
    pipeline: {
      name: 'AT Default',
      // ordered department codes the job flows through
      steps: ['DESIGN', 'LASER', 'MS_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK'],
    },
  },
] as const

const DEMO_PIN = '123456'

async function main() {
  console.log('Seeding GRYNX…')

  // ── departments ──────────────────────────────────────────────────────────
  const deptByCode = new Map<string, string>()
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name, sortOrder: d.sortOrder },
      create: d,
    })
    deptByCode.set(d.code, row.id)
  }
  console.log(`  departments: ${deptByCode.size}`)

  // ── hold reasons ─────────────────────────────────────────────────────────
  for (const h of HOLD_REASONS) {
    await prisma.holdReason.upsert({
      where: { code: h.code },
      update: { label: h.label },
      create: h,
    })
  }

  // ── settings ─────────────────────────────────────────────────────────────
  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as object },
      create: { key: s.key, value: s.value as object },
    })
  }

  // ── catalogue + pipelines ────────────────────────────────────────────────
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description },
      create: { code: p.code, name: p.name, description: p.description },
    })

    for (const m of p.models) {
      await prisma.model.upsert({
        where: { productId_code: { productId: product.id, code: m.code } },
        update: { name: m.name },
        create: { productId: product.id, code: m.code, name: m.name },
      })
    }

    // pipeline template (+ steps). Rebuild steps to match the declared order.
    let template = await prisma.pipelineTemplate.findFirst({
      where: { productId: product.id, name: p.pipeline.name },
    })
    if (!template) {
      template = await prisma.pipelineTemplate.create({
        data: { productId: product.id, name: p.pipeline.name, isDefault: true },
      })
    } else {
      await prisma.pipelineTemplateStep.deleteMany({ where: { templateId: template.id } })
    }
    await prisma.pipelineTemplateStep.createMany({
      data: p.pipeline.steps.map((code, i) => ({
        templateId: template!.id,
        departmentId: deptByCode.get(code)!,
        sequence: (i + 1) * 10,
      })),
    })
    console.log(`  product ${p.code}: ${p.models.length} models, pipeline "${p.pipeline.name}" (${p.pipeline.steps.length} steps)`)
  }

  // ── users ────────────────────────────────────────────────────────────────
  // PIN 123456 across the board for the pilot (matches the prototype login).
  const pinHash = await hashSecret(DEMO_PIN)

  const upsertUser = async (
    username: string,
    fullName: string,
    role: 'admin' | 'ppc' | 'dept_head' | 'qc' | 'fg_stock' | 'maintenance',
    departmentCode?: string,
  ) => {
    const user = await prisma.user.upsert({
      where: { username },
      update: { fullName },
      create: { username, fullName, pinHash, passwordHash: pinHash },
    })
    const departmentId = departmentCode ? deptByCode.get(departmentCode) ?? null : null
    const existing = await prisma.roleAssignment.findFirst({
      where: { userId: user.id, role, departmentId },
    })
    if (!existing) {
      await prisma.roleAssignment.create({ data: { userId: user.id, role, departmentId } })
    }
    return user
  }

  await upsertUser('admin', 'Administrator', 'admin')
  await upsertUser('ppc', 'PPC Planner', 'ppc')
  // one head per operational department so scan-to-advance is testable end to end
  for (const code of ['DESIGN', 'LASER', 'MS_PROD', 'ALLOY_PROD', 'CNC_VMC', 'MNTR', 'POWDER']) {
    await upsertUser(code.toLowerCase(), `${code} Head`, 'dept_head', code)
  }
  await upsertUser('qc', 'QC Inspector', 'qc', 'QC')
  await upsertUser('fg', 'FG Stock', 'fg_stock', 'FG_STOCK')
  await upsertUser('maint', 'Maintenance', 'maintenance', 'MAINT')

  const userCount = await prisma.user.count()
  console.log(`  users: ${userCount} (all PIN ${DEMO_PIN})`)
  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
