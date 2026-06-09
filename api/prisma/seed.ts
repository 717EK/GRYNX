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
  { key: 'maint.escalation.acknowledgeMins', value: 15 }, // unacked ticket -> re-notify head + admin
  { key: 'maint.escalation.assignMins', value: 30 }, // unassigned ticket -> escalate to admin
]

const ALLOY_STEPS = ['DESIGN', 'LASER', 'ALLOY_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK']
const MS_STEPS = ['DESIGN', 'LASER', 'MS_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK']
// products without a real model list yet carry a single "Custom" model
const CUSTOM_ONLY = [{ code: 'Custom', name: 'Custom', sizes: [] as string[] }]

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
// one model per truss TYPE, carrying its available lengths (size picked per job)
const alloyModels = ALLOY_TRUSS.map(([type, sizes]) => ({ code: type, name: type, sizes }))

const PRODUCTS: {
  code: string
  name: string
  description?: string
  models: { code: string; name: string; sizes: string[] }[]
  pipeline: { name: string; steps: string[] }
}[] = [
  { code: 'AT', name: 'Alloy Truss', description: 'Aluminium truss systems', models: alloyModels, pipeline: { name: 'Alloy Truss Default', steps: ALLOY_STEPS } },
  // other lines — real model lists to be added by the owner; "Custom" for now
  { code: 'MT', name: 'MS Truss', description: 'Mild-steel truss systems', models: CUSTOM_ONLY, pipeline: { name: 'MS Truss Default', steps: MS_STEPS } },
  { code: 'SC', name: 'Scaffolding', models: CUSTOM_ONLY, pipeline: { name: 'Scaffolding Default', steps: MS_STEPS } },
  { code: 'ST', name: 'Stage', models: CUSTOM_ONLY, pipeline: { name: 'Stage Default', steps: MS_STEPS } },
  { code: 'MJ', name: 'Mojo', description: 'Mojo barriers', models: CUSTOM_ONLY, pipeline: { name: 'Mojo Default', steps: MS_STEPS } },
  { code: 'LF', name: 'Lifter', models: CUSTOM_ONLY, pipeline: { name: 'Lifter Default', steps: MS_STEPS } },
  { code: 'SK', name: 'Stacker', models: CUSTOM_ONLY, pipeline: { name: 'Stacker Default', steps: MS_STEPS } },
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
        update: { name: m.name, sizes: m.sizes, active: true },
        create: { productId: product.id, code: m.code, name: m.name, sizes: m.sizes },
      })
    }
    // retire models no longer in the list (old placeholder SKUs)
    await prisma.model.updateMany({
      where: { productId: product.id, code: { notIn: p.models.map((m) => m.code) } },
      data: { active: false },
    })

    // pipeline template (+ steps). Rebuild steps to match the declared order.
    // Demote any stale templates so exactly one default remains per product.
    await prisma.pipelineTemplate.updateMany({
      where: { productId: product.id, name: { not: p.pipeline.name } },
      data: { isDefault: false },
    })
    let template = await prisma.pipelineTemplate.findFirst({
      where: { productId: product.id, name: p.pipeline.name },
    })
    if (!template) {
      template = await prisma.pipelineTemplate.create({
        data: { productId: product.id, name: p.pipeline.name, isDefault: true },
      })
    } else {
      await prisma.pipelineTemplate.update({ where: { id: template.id }, data: { isDefault: true } })
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
  await upsertUser('admin', 'Administrator', 'admin') // SuperUser (View As, testing)
  await upsertUser('ppc', 'Deepak (PPC)', 'ppc')
  // named heads per operational department (+ a backup on a couple) for testing
  const HEADS: [string, string, string?][] = [
    ['DESIGN', 'Pratik', 'Neha'],
    ['LASER', 'Ramesh', 'Imran'],
    ['MS_PROD', 'Suresh'],
    ['ALLOY_PROD', 'Mahesh'],
    ['CNC_VMC', 'Vijay', 'Anil'],
    ['MNTR', 'Kunal'],
    ['POWDER', 'Arjun'],
  ]
  for (const [code, head, backup] of HEADS) {
    await upsertUser(code.toLowerCase(), `${head} (${code})`, 'dept_head', code)
    if (backup) await upsertUser(`${code.toLowerCase()}2`, `${backup} (${code})`, 'dept_head', code)
  }
  await upsertUser('qc', 'QC Inspector', 'qc', 'QC')
  await upsertUser('fg', 'FG Stock', 'fg_stock', 'FG_STOCK')
  // maintenance crew (head + technicians) for assignment/escalation testing
  await upsertUser('maint', 'Maintenance Head', 'maintenance', 'MAINT')
  await upsertUser('maint2', 'Ravi (Electrical)', 'maintenance', 'MAINT')
  await upsertUser('maint3', 'Suresh (Mechanical)', 'maintenance', 'MAINT')

  const userCount = await prisma.user.count()
  console.log(`  users: ${userCount} (all PIN ${DEMO_PIN})`)

  // ── sample PPC requests (for the review queue) — only if the queue is empty ──
  const pendingPpc = await prisma.ppcRequest.count({ where: { status: 'submitted' } })
  if (pendingPpc < 3) {
    const ppcUser = await prisma.user.findUnique({ where: { username: 'ppc' }, select: { id: true } })
    const at = await prisma.product.findUnique({
      where: { code: 'AT' },
      include: { models: { where: { active: true }, select: { id: true, code: true, sizes: true } } },
    })
    if (ppcUser && at) {
      const pick = (n: number) => at.models.filter((m) => m.sizes.length).slice(0, n)
      const samples: { priority: 'normal' | 'urgent'; lines: { code: string; n: number }[] }[] = [
        { priority: 'urgent', lines: [{ code: 'LD38', n: 40 }, { code: 'LD38', n: 10 }] },
        { priority: 'normal', lines: [{ code: 'ST-35', n: 60 }, { code: 'HD48', n: 12 }] },
        { priority: 'normal', lines: [{ code: 'JTX', n: 24 }] },
        { priority: 'urgent', lines: [{ code: 'RT65', n: 18 }, { code: 'DT-XR', n: 8 }] },
      ]
      let n = 0
      for (const s of samples) {
        const seq = (await prisma.dailySequence.upsert({ where: { scope: 'ppc:counter' }, update: { lastValue: { increment: 1 } }, create: { scope: 'ppc:counter', lastValue: 1 } })).lastValue
        const lines = s.lines
          .map((l) => {
            const m = at.models.find((x) => x.code === l.code) ?? pick(1)[0]
            return m ? { modelId: m.id, size: m.sizes[0] ?? null, quantity: l.n } : null
          })
          .filter((x): x is { modelId: string; size: string | null; quantity: number } => !!x)
        if (!lines.length) continue
        await prisma.ppcRequest.create({
          data: {
            requestNo: `PR-${String(seq).padStart(4, '0')}`,
            productId: at.id,
            priority: s.priority,
            status: 'submitted',
            createdById: ppcUser.id,
            models: { create: lines },
          },
        })
        n++
      }
      console.log(`  sample PPC requests created: ${n}`)
    }
  }
  console.log('Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
