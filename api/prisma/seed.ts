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

const ALLOY_STEPS = ['DESIGN', 'LASER', 'ALLOY_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK']

// Real Alloy Truss catalogue (owner-provided stock sheets, GT + UTT lines).
// Each entry is [truss type, [available lengths]]; one model SKU per length,
// coded "TYPE LENGTH" (e.g. "LD38 3M") to match the stock sheet exactly.
const ALLOY_TRUSS: [string, string[]][] = [
  ['LD30', ['3M', '2M', '1M', '0.5M', '0.25M']],
  ['LD38', ['3M', '2M', '1M', '0.5M', '0.25M']],
  ['LD40', ['3M', '2M', '1M', '0.5M']],
  ['HD38R', ['3M', '2M', '1M']],
  ['HD40R', ['3M', '2M', '1M', '0.5M']],
  ['HD48', ['3M', '2M', '1M', '1800MM', '1200MM', '0.5M']],
  ['HD-48LP', ['1873MM']],
  ['HD48R', ['3M', '1800MM', '1200MM']],
  ['JTH2', ['3M', '2M', '1M', '0.5M']],
  ['JTX', ['3M', '2M', '1.5M', '1M', '0.5M']],
  ['JTEX', ['3M', '2M', '1M', '0.5M']],
  ['MT', ['3M', '2M', '1M', '0.5M']],
  ['MTX', ['3M', '2M', '1M', '0.5M']],
  ['MTEX', ['3M', '2M', '1M', '0.5M']],
  ['DT', ['3M', '2M', '1M']],
  ['DT-XR', ['3M', '2M', '1M', '0.5M']],
  ['LD30R', ['3M', '2M', '1M', '0.5M']],
  ['ROUND TRUSS 380x380', ['5M', '6M']],
  ['RT65', ['3M', '2M', '1M']],
  ['ET50', ['3M', '2M', '1M']],
  ['ST-30', ['3M', '2M']],
  ['ST-35', ['3M', '2M', '1M', '0.5M', '0.25M']],
  ['ST52', ['3M', '2M', '1.5M', '1M']],
  ['ST40', ['3M', '2M', '1M']],
  ['RT77', ['3M', '2M', '1M']],
  ['RT1010', ['3M', '2M', '1M']],
  ['DUBAI 387x387', ['3M', '1M']],
  ['ST520V', ['3M', '2M', '1.5M', '1M']],
]
const alloyModels = ALLOY_TRUSS.flatMap(([type, sizes]) =>
  sizes.map((s) => ({ code: `${type} ${s}`, name: `${type} ${s}` })),
)

const PRODUCTS: {
  code: string
  name: string
  description?: string
  models: { code: string; name: string }[]
  pipeline: { name: string; steps: string[] }
}[] = [
  { code: 'AT', name: 'Alloy Truss', description: 'Aluminium truss systems', models: alloyModels, pipeline: { name: 'Alloy Truss Default', steps: ALLOY_STEPS } },
]

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
  // hide any product not in the current list (e.g. earlier placeholder lines)
  await prisma.product.updateMany({
    where: { code: { notIn: PRODUCTS.map((p) => p.code) } },
    data: { active: false },
  })
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { code: p.code },
      update: { name: p.name, description: p.description, active: true },
      create: { code: p.code, name: p.name, description: p.description },
    })

    for (const m of p.models) {
      await prisma.model.upsert({
        where: { productId_code: { productId: product.id, code: m.code } },
        update: { name: m.name, active: true },
        create: { productId: product.id, code: m.code, name: m.name },
      })
    }
    // retire models no longer in the list (old placeholder SKUs)
    await prisma.model.updateMany({
      where: { productId: product.id, code: { notIn: p.models.map((m) => m.code) } },
      data: { active: false },
    })

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
      update: { fullName, status: 'active' },
      create: { username, fullName, pinHash, passwordHash: pinHash, status: 'active' },
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

  await upsertUser('aashish', 'AASHISH', 'admin') // primary admin (PIN 123456)
  await upsertUser('admin', 'Administrator', 'admin') // legacy alias, kept working
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
