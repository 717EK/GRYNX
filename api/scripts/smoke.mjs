// End-to-end smoke test against a running GRYNX API (default :4000).
// Run: node scripts/smoke.mjs   (server must be up: npm run dev)
const BASE = process.env.BASE ?? 'http://localhost:4000'

let pass = 0
let fail = 0
const ok = (cond, msg) => (cond ? (pass++, console.log(`  ✓ ${msg}`)) : (fail++, console.error(`  ✗ ${msg}`)))

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = text ? JSON.parse(text) : null } catch { json = text }
  return { status: res.status, json }
}

console.log('GRYNX API smoke test →', BASE)

// 1. health
const h = await call('GET', '/health')
ok(h.status === 200 && h.json?.ok, 'health ok + DB reachable')

// 2. login admin
const login = await call('POST', '/api/v1/auth/login', { body: { username: 'admin', pin: '123456' } })
ok(login.status === 200 && login.json?.accessToken, 'admin login returns access token')
const admin = login.json?.accessToken

// 3. catalogue
const prods = await call('GET', '/api/v1/products', { token: admin })
ok(prods.status === 200 && prods.json?.products?.length > 0, 'products list returns AT')
const at = prods.json.products.find((p) => p.code === 'AT')
ok(at?.models?.length >= 3, 'AT has >=3 models')
ok(at?.pipelines?.[0]?.steps?.length === 7, 'AT default pipeline has 7 steps')

// 4. create a job
const created = await call('POST', '/api/v1/jobs', {
  token: admin,
  body: {
    productId: at.id,
    priority: 'urgent',
    models: [
      { modelId: at.models[0].id, quantity: 20 },
      { modelId: at.models[1].id, quantity: 15 },
      { modelId: at.models[2].id, quantity: 10 },
    ],
  },
})
ok(created.status === 201, 'job create → 201')
const job = created.json?.job
ok(/^J[0-9A-Z]{11}$/.test(job?.jobNo ?? ''), `opaque jobNo well-formed (${job?.jobNo})`)
ok(/^AT-U-045-\d{6}-\d{3}$/.test(job?.displayLabel ?? ''), `display label scheme (${job?.displayLabel})`)
ok(job?.status === 'in_production', 'job status = in_production')
ok(job?.steps?.length === 7, 'snapshotted 7 job_steps')
ok(job?.steps?.[0]?.status === 'waiting_acceptance', 'first step = waiting_acceptance')
ok(job?.steps?.slice(1).every((s) => s.status === 'pending'), 'remaining steps = pending')

// 5. fetch detail
const detail = await call('GET', `/api/v1/jobs/${job.id}`, { token: admin })
ok(detail.status === 200 && detail.json?.job?.events?.length >= 1, 'job detail has timeline event')
ok(detail.json?.job?.models?.length === 3, 'job detail has 3 models')

// 6. RBAC: dept_head cannot create a job
const dh = await call('POST', '/api/v1/auth/login', { body: { username: 'laser', pin: '123456' } })
const forbidden = await call('POST', '/api/v1/jobs', {
  token: dh.json.accessToken,
  body: { productId: at.id, models: [{ modelId: at.models[0].id, quantity: 1 }] },
})
ok(forbidden.status === 403, 'dept_head create job → 403 (RBAC)')

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
