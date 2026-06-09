// In-browser demo backend. Active when VITE_API_BASE is not configured (e.g.
// the Vercel build with no env var). Mirrors the real API shapes so the app
// runs end-to-end with no server — login, create job, scan-advance, signup/
// approvals — persisted to localStorage so it survives reloads on a phone.
// The instant VITE_API_BASE points at a real server, none of this runs.

import { ApiError, type ApiUser, type ProductDTO, type JobDTO, type ScanResult, type PendingUser, type DeptLite, type CreateJobInput, type SignupInput } from './api'

const DEPARTMENTS: DeptLite[] = [
  { id: 'd_design', code: 'DESIGN', name: 'Design' },
  { id: 'd_purchase', code: 'PURCHASE', name: 'Purchase' },
  { id: 'd_laser', code: 'LASER', name: 'Laser / Cutting' },
  { id: 'd_ms', code: 'MS_PROD', name: 'MS Production' },
  { id: 'd_alloy', code: 'ALLOY_PROD', name: 'Alloy Production' },
  { id: 'd_cnc', code: 'CNC_VMC', name: 'CNC / VMC' },
  { id: 'd_mntr', code: 'MNTR', name: 'MNTR' },
  { id: 'd_powder', code: 'POWDER', name: 'Powder Coat' },
  { id: 'd_qc', code: 'QC', name: 'QC' },
  { id: 'd_fg', code: 'FG_STOCK', name: 'FG Stock' },
  { id: 'd_maint', code: 'MAINT', name: 'Maintenance' },
]
const deptByCode = Object.fromEntries(DEPARTMENTS.map((d) => [d.code, d]))

const ALLOY_STEPS = ['DESIGN', 'LASER', 'ALLOY_PROD', 'CNC_VMC', 'POWDER', 'QC', 'FG_STOCK']
// Real Alloy Truss catalogue (mirrors api/prisma/seed.ts). One model per type,
// carrying its available lengths.
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
const PRODUCTS: ProductDTO[] = [
  {
    id: 'p_AT',
    code: 'AT',
    name: 'Alloy Truss',
    description: 'Aluminium truss systems',
    models: ALLOY_TRUSS.map(([t, sizes]) => ({ id: `m_${t}`, code: t, name: t, sizes })),
    pipelines: [
      {
        id: 'pl_AT',
        name: 'Alloy Truss Default',
        isDefault: true,
        steps: ALLOY_STEPS.map((sc, i) => ({ sequence: (i + 1) * 10, department: deptByCode[sc] })),
      },
    ],
  },
]

type Role = ApiUser['roles'][number]
type SeedUser = { username: string; fullName: string; roles: Role[] }
const seedUser = (username: string, fullName: string, role: Role['role'], deptCode?: string): SeedUser => ({
  username,
  fullName,
  roles: [{ role, departmentId: deptCode ? deptByCode[deptCode].id : null }],
})

const SEED_USERS: SeedUser[] = [
  seedUser('aashish', 'AASHISH', 'admin'),
  seedUser('admin', 'Administrator', 'admin'),
  seedUser('ppc', 'PPC Planner', 'ppc'),
  seedUser('design', 'DESIGN Head', 'dept_head', 'DESIGN'),
  seedUser('laser', 'LASER Head', 'dept_head', 'LASER'),
  seedUser('ms_prod', 'MS_PROD Head', 'dept_head', 'MS_PROD'),
  seedUser('alloy_prod', 'ALLOY_PROD Head', 'dept_head', 'ALLOY_PROD'),
  seedUser('cnc_vmc', 'CNC_VMC Head', 'dept_head', 'CNC_VMC'),
  seedUser('mntr', 'MNTR Head', 'dept_head', 'MNTR'),
  seedUser('powder', 'POWDER Head', 'dept_head', 'POWDER'),
  seedUser('qc', 'QC Inspector', 'qc', 'QC'),
  seedUser('fg', 'FG Stock', 'fg_stock', 'FG_STOCK'),
  seedUser('maint', 'Maintenance', 'maintenance', 'MAINT'),
]

// ── persisted state (signups, jobs, sequence) ────────────────────────────────
interface DemoExtraUser extends SeedUser {
  id: string
  pin: string
  status: 'pending' | 'active' | 'suspended'
  createdAt: string
}
interface DemoState {
  extraUsers: DemoExtraUser[]
  jobs: JobDTO[]
  seq: number
}
const STATE_KEY = 'grynx-demo-state'
function load(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) || '')
    if (s && Array.isArray(s.jobs)) return s
  } catch {
    /* fall through */
  }
  return { extraUsers: [], jobs: [], seq: 0 }
}
let state = load()
const save = () => localStorage.setItem(STATE_KEY, JSON.stringify(state))

const delay = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))
const findSeed = (u: string) => SEED_USERS.find((x) => x.username.toLowerCase() === u.toLowerCase())
const findExtra = (u: string) => state.extraUsers.find((x) => x.username.toLowerCase() === u.toLowerCase())

const pad2 = (n: number) => String(n).padStart(2, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')
const ddmmyy = (d: Date) => `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}`
function opaqueJobNo() {
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  let s = 'J'
  for (let i = 0; i < 11; i++) s += A[Math.floor(Math.random() * 32)]
  return s
}

// ── auth ─────────────────────────────────────────────────────────────────────
export function demoLogin(username: string, pin: string) {
  const seed = findSeed(username)
  if (seed) {
    if (pin !== '123456') throw new ApiError(401, { error: 'invalid_credentials' })
    return { accessToken: 'demo', refreshToken: 'demo', user: { id: `u_${seed.username}`, ...seed } }
  }
  const extra = findExtra(username)
  if (extra) {
    if (pin !== extra.pin) throw new ApiError(401, { error: 'invalid_credentials' })
    if (extra.status !== 'active') throw new ApiError(403, { error: extra.status === 'pending' ? 'account_pending' : 'account_suspended' })
    return { accessToken: 'demo', refreshToken: 'demo', user: { id: extra.id, username: extra.username, fullName: extra.fullName, roles: extra.roles } }
  }
  throw new ApiError(401, { error: 'invalid_credentials' })
}

export const demoDepartments = () => delay({ departments: DEPARTMENTS })
export const demoProducts = () => delay({ products: PRODUCTS })

export function demoSignup(input: SignupInput) {
  const exists = findSeed(input.phone) || findExtra(input.phone)
  if (exists) throw new ApiError(409, { error: 'phone_already_registered' })
  const dept = DEPARTMENTS.find((d) => d.id === input.departmentId)
  if (!dept) throw new ApiError(400, { error: 'invalid_department' })
  const u: DemoExtraUser = {
    id: `u_${Date.now()}`,
    username: input.phone,
    fullName: input.fullName,
    pin: input.pin,
    status: 'pending',
    createdAt: new Date().toISOString(),
    roles: [{ role: 'dept_head', departmentId: dept.id }],
  }
  state.extraUsers.push(u)
  save()
  return delay({ user: { id: u.id, username: u.username, status: u.status }, message: 'Account created — awaiting admin approval' })
}

export function demoListUsers(status?: string): Promise<{ users: PendingUser[] }> {
  const users: PendingUser[] = state.extraUsers
    .filter((u) => !status || u.status === status)
    .map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      status: u.status,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => ({
        role: r.role,
        department: r.departmentId ? { code: deptById(r.departmentId)?.code ?? '', name: deptById(r.departmentId)?.name ?? '' } : null,
      })),
    }))
  return delay({ users })
}
const deptById = (id: string) => DEPARTMENTS.find((d) => d.id === id)
export function demoSetStatus(id: string, status: 'active' | 'suspended') {
  const u = state.extraUsers.find((x) => x.id === id)
  if (u) {
    u.status = status
    save()
  }
  return delay({ ok: true })
}

// ── jobs ─────────────────────────────────────────────────────────────────────
function makeSteps(stepCodes: string[]): NonNullable<JobDTO['steps']> {
  return stepCodes.map((code, i) => ({
    id: `s_${Math.random().toString(16).slice(2)}`,
    sequence: (i + 1) * 10,
    status: i === 0 ? 'waiting_acceptance' : 'pending',
    slaDueAt: null,
    department: { code, name: deptByCode[code].name },
  }))
}

export function demoCreateJob(input: CreateJobInput) {
  const product = PRODUCTS.find((p) => p.id === input.productId)
  if (!product) throw new ApiError(404, { error: 'product_not_found' })
  const stepCodes = product.pipelines[0].steps.map((s) => s.department.code)
  const totalQty = input.models.reduce((s, m) => s + m.quantity, 0)
  state.seq += 1
  const now = new Date()
  const pr = input.priority === 'urgent' ? 'U' : 'N'
  const job: JobDTO = {
    id: `j_${Date.now()}`,
    jobNo: opaqueJobNo(),
    displayLabel: `${product.code}-${pr}-${pad3(totalQty)}-${ddmmyy(now)}-${pad3(state.seq)}`,
    status: 'in_production',
    priority: input.priority,
    totalQty,
    product: { code: product.code, name: product.name },
    steps: makeSteps(stepCodes),
    models: input.models.map((m) => {
      const model = product.models.find((x) => x.id === m.modelId)!
      return { quantity: m.quantity, size: m.size ?? null, model: { code: model.code, name: model.name } }
    }),
    events: [{ id: 'e0', type: 'created', body: 'created', createdAt: now.toISOString() }],
  }
  state.jobs.unshift(job)
  save()
  return delay({ job })
}

export const demoGetJobs = () => delay({ jobs: state.jobs })
export function demoGetJob(id: string) {
  const job = state.jobs.find((j) => j.id === id)
  if (!job) throw new ApiError(404, { error: 'not_found' })
  return delay({ job })
}

// arrival-scan advance, mirroring the real engine (single station per job here)
export function demoScan(jobNo: string, stationCode: string | null, preview: boolean): { status: number; data: ScanResult } {
  if (!stationCode) return { status: 403, data: { result: 'rejected_out_of_seq', reason: 'no_station' } }
  const code = jobNo.trim()
  const job = state.jobs.find((j) => j.jobNo === code || j.displayLabel === code)
  if (!job || !job.steps) return { status: 404, data: { result: 'rejected_out_of_seq', reason: 'job_not_found' } }

  const steps = job.steps
  const scanned = steps.find((s) => s.department.code === stationCode && s.status !== 'completed' && s.status !== 'skipped')
  if (!scanned) return { status: 409, data: { result: 'rejected_out_of_seq', reason: 'station_not_pending_for_job', label: job.displayLabel } }
  if (scanned.status === 'in_progress') return { status: 200, data: { result: 'duplicate', label: job.displayLabel, reason: 'already_in_progress' } }
  if (scanned.status !== 'waiting_acceptance')
    return { status: 409, data: { result: 'rejected_out_of_seq', label: job.displayLabel, hint: 'previous stations not complete' } }

  const prior = steps.find((s) => s.status === 'in_progress') ?? null
  const next = steps.find((s) => s.sequence > scanned.sequence && s.status === 'pending') ?? null

  if (preview) {
    return { status: 200, data: { result: 'applied', preview: true, label: job.displayLabel, to: scanned.department.name, completes: prior?.department.name ?? null } }
  }

  if (prior) prior.status = 'completed'
  scanned.status = 'in_progress'
  if (next) next.status = 'waiting_acceptance'
  job.status = stationCode === 'QC' ? 'in_qc' : stationCode === 'FG_STOCK' ? 'in_fg' : 'in_production'
  job.events = [{ id: `e_${Date.now()}`, type: 'scan', body: scanned.department.name, createdAt: new Date().toISOString() }, ...(job.events ?? [])]
  save()
  return { status: 200, data: { result: 'applied', label: job.displayLabel, station: scanned.department.name, completed: prior?.department.name ?? null, jobStatus: job.status } }
}

// resolve the scanner's station from their roles (mirrors server-side derivation)
export function demoScanForUser(roles: Role[], jobNo: string, preview: boolean) {
  const floor = roles.find((r) => ['dept_head', 'qc', 'fg_stock', 'maintenance'].includes(r.role) && r.departmentId)
  const code = floor?.departmentId ? deptById(floor.departmentId)?.code ?? null : null
  return demoScan(jobNo, code, preview)
}

// ── job card (no server) ─────────────────────────────────────────────────────
export function demoJobCardHtml(id: string): string {
  const job = state.jobs.find((j) => j.id === id)
  if (!job) return '<h1>Job not found</h1>'
  const rows = (job.models ?? []).map((m) => `<tr><td>${m.model.code}</td><td>${m.size ?? '—'}</td><td style="text-align:right">${m.quantity}</td></tr>`).join('')
  const pills = (job.steps ?? []).map((s) => `<span style="border:1px solid #ddd;border-radius:3px;padding:2px 8px"><b style="color:#f5a623">${s.sequence / 10}</b> ${s.department.name}</span>`).join(' → ')
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${job.displayLabel}</title>
  <body style="font-family:'Space Mono',monospace;padding:18px;max-width:640px;margin:auto">
  <div style="border:2px solid #0a0a0a;padding:18px">
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #0a0a0a;padding-bottom:8px">
      <b>D-LYFT · GRYNX</b><span style="border:1.5px solid #0a0a0a;padding:2px 8px">${job.priority.toUpperCase()}</span>
    </div>
    <h1 style="font-size:28px;margin:12px 0 2px">${job.displayLabel}</h1>
    <div style="color:#666;font-size:12px">${job.product?.name ?? ''} · ${job.totalQty} units</div>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px">
      <tr style="color:#666;font-size:10px;text-transform:uppercase"><td>Model</td><td>Name</td><td style="text-align:right">Qty</td></tr>${rows}
    </table>
    <div style="margin-top:14px;font-size:12px;line-height:2"><b>Pipeline:</b><br>${pills}</div>
    <div style="margin-top:16px;text-align:center;border:2px dashed #0a0a0a;padding:14px">
      <div style="font-size:11px;color:#666">SCAN CODE (enter on the Scan screen)</div>
      <div style="font-size:26px;letter-spacing:.18em;font-weight:700">${job.jobNo}</div>
    </div>
    <div style="margin-top:10px;font-size:11px;color:#666;text-align:center">DEMO job card · scan on arrival at each station</div>
  </div>
  <div style="text-align:center;margin-top:14px"><button onclick="window.print()" style="font:inherit;padding:8px 18px;border:1.5px solid #0a0a0a;background:#f5a623">Print</button></div>
  </body>`
}
