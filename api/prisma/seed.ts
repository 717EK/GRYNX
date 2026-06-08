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

// Catalogue — starter set covering D-LYFT's product lines. Names/models are
// sensible defaults; the owner can refine (real catalogue is owner-managed).
// Two default routings: ALLOY (via Alloy Production) and MS (via MS Production).
// Pipelines are per-job editable in the UI, so these are just starting points.
const m = (codes: string[]) => codes.map((c) => ({ code: c, name: c }))
const ALLOY_STEPS = ['DESIGN', 'LASER', 'ALLOY_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK']
const MS_STEPS = ['DESIGN', 'LASER', 'MS_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK']

const PRODUCTS: {
  code: string
  name: string
  description?: string
  models: { code: string; name: string }[]
  pipeline: { name: string; steps: string[] }
}[] = [
  { code: 'AT', name: 'Alloy Truss', description: 'Aluminium truss systems', models: m(['AT290', 'AT400', 'AT500', 'AT600', 'AT700', 'AT800', 'AT1000']), pipeline: { name: 'Alloy Truss Default', steps: ALLOY_STEPS } },
  { code: 'MT', name: 'MS Truss', description: 'Mild-steel truss systems', models: m(['MT290', 'MT400', 'MT500', 'MT600']), pipeline: { name: 'MS Truss Default', steps: MS_STEPS } },
  { code: 'SC', name: 'Scaffolding', models: m(['SC-1.0M', 'SC-1.5M', 'SC-2.0M']), pipeline: { name: 'Scaffolding Default', steps: MS_STEPS } },
  { code: 'ST', name: 'Stage', models: m(['ST-4x4', 'ST-6x4', 'ST-8x6']), pipeline: { name: 'Stage Default', steps: MS_STEPS } },
  { code: 'MJ', name: 'Mojo', description: 'Mojo barriers (alloy/MS)', models: m(['MJ-A', 'MJ-B']), pipeline: { name: 'Mojo Default', steps: MS_STEPS } },
  { code: 'LF', name: 'Lifter', description: 'Lifters (alloy/MS)', models: m(['LF-1T', 'LF-2T', 'LF-3T']), pipeline: { name: 'Lifter Default', steps: MS_STEPS } },
  { code: 'SK', name: 'Stacker', models: m(['SK-S', 'SK-L']), pipeline: { name: 'Stacker Default', steps: MS_STEPS } },
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
