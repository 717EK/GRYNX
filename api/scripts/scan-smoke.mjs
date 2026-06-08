// Scan-engine e2e: drives one job through the whole AT pipeline and exercises
// duplicate / out-of-sequence / idempotent-replay / job-status transitions.
// Run with the server up: node scripts/scan-smoke.mjs
import { randomUUID } from 'node:crypto'
const BASE = process.env.BASE ?? 'http://localhost:4000'

let pass = 0, fail = 0
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.error(`  ✗ ${m}`)))

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json; try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json }
}
const login = async (u) => (await call('POST', '/api/v1/auth/login', { body: { username: u, pin: '123456' } })).json.accessToken
const scan = (token, jobNo, extra = {}) =>
  call('POST', '/api/v1/scan', { token, body: { jobNo, idempotencyKey: randomUUID(), clientTs: new Date().toISOString(), ...extra } })

console.log('GRYNX scan-engine smoke →', BASE)

const admin = await login('admin')
const at = (await call('GET', '/api/v1/products', { token: admin })).json.products.find((p) => p.code === 'AT')
const created = await call('POST', '/api/v1/jobs', {
  token: admin,
  body: { productId: at.id, priority: 'normal', models: [{ modelId: at.models[0].id, quantity: 30 }] },
})
const jobNo = created.json.job.jobNo
const jobId = created.json.job.id
ok(!!jobNo, `created job ${created.json.job.displayLabel}`)

// station tokens, in pipeline order
const T = {}
for (const u of ['design', 'laser', 'ms_prod', 'cnc_vmc', 'powder', 'qc', 'fg']) T[u] = await login(u)

// preview (dry-run) at design
const prev = await scan(T.design, jobNo, { preview: true })
ok(prev.json.preview === true && prev.json.to === 'Design', 'preview: would start at Design')

// admin cannot scan (no station)
const adminScan = await scan(admin, jobNo)
ok(adminScan.status === 403, 'admin scan → 403 (no station)')

// out-of-sequence: powder before the job arrives
const early = await scan(T.powder, jobNo)
ok(early.status === 409 && early.json.result === 'rejected_out_of_seq', 'powder scan before arrival → out_of_seq')

// arrival scan at design (first step)
const s1 = await scan(T.design, jobNo)
ok(s1.status === 200 && s1.json.result === 'applied' && s1.json.station === 'Design', 'design scan → applied (start)')

// re-scan design with a NEW key while in progress → duplicate (no-op)
const dupStation = await scan(T.design, jobNo)
ok(dupStation.json.result === 'duplicate', 'design re-scan (in progress) → duplicate')

// idempotent replay: same key fired CONCURRENTLY = exactly one advance.
// (Sequential retries are caught earlier by state inspection; this proves the
// UNIQUE idempotency_key guard under a true race.)
const key = randomUUID()
const fire = () => call('POST', '/api/v1/scan', { token: T.laser, body: { jobNo, idempotencyKey: key, clientTs: new Date().toISOString() } })
const [a, b] = await Promise.all([fire(), fire()])
const applied = [a, b].find((r) => r.json.result === 'applied' && r.json.completed === 'Design')
const replayed = [a, b].find((r) => r.json.replayed === true || r.json.result === 'superseded')
ok(!!applied, 'laser scan (race) → exactly one applied, completes Design')
ok(!!replayed, 'duplicate key in race → replayed/superseded (no double advance)')

// verify state after design+laser: Design completed, Laser in_progress, rest pending/waiting
let detail = (await call('GET', `/api/v1/jobs/${jobId}`, { token: admin })).json.job
const byCode = (c) => detail.steps.find((s) => s.department.code === c)
ok(byCode('DESIGN').status === 'completed', 'Design = completed')
ok(byCode('LASER').status === 'in_progress', 'Laser = in_progress')
ok(byCode('MS_PROD').status === 'waiting_acceptance', 'MS_PROD armed = waiting_acceptance (next-station notify)')
ok(byCode('CNC_VMC').status === 'pending', 'CNC_VMC = pending')

// walk to the end
ok((await scan(T.ms_prod, jobNo)).json.result === 'applied', 'ms_prod scan → applied')
ok((await scan(T.cnc_vmc, jobNo)).json.result === 'applied', 'cnc_vmc scan → applied')
ok((await scan(T.powder, jobNo)).json.result === 'applied', 'powder scan → applied')
const qc = await scan(T.qc, jobNo)
ok(qc.json.result === 'applied' && qc.json.jobStatus === 'in_qc', 'qc scan → applied, job in_qc')
const fg = await scan(T.fg, jobNo)
ok(fg.json.result === 'applied' && fg.json.jobStatus === 'in_fg', 'fg scan → applied, job in_fg')

detail = (await call('GET', `/api/v1/jobs/${jobId}`, { token: admin })).json.job
ok(detail.status === 'in_fg', 'job status = in_fg')
ok(['DESIGN','LASER','MS_PROD','CNC_VMC','POWDER','QC'].every((c) => byCodeOn(detail, c) === 'completed'), 'all prod+QC steps completed')
ok(byCodeOn(detail, 'FG_STOCK') === 'in_progress', 'FG_STOCK = in_progress (awaiting closure)')
function byCodeOn(d, c) { return d.steps.find((s) => s.department.code === c).status }

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
