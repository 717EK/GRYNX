// Signup → pending → admin approve → login flow. Run with the server up.
const BASE = process.env.BASE ?? 'http://localhost:4000'
let pass = 0, fail = 0
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.error(`  ✗ ${m}`)))
async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : null } catch { j = t }
  return { status: res.status, json: j }
}

const phone = '+91' + Math.floor(7000000000 + Math.random() * 999999999)
console.log('GRYNX signup smoke →', BASE, '| phone', phone)

// admin aashish works
const admin = (await call('POST', '/api/v1/auth/login', { body: { username: 'aashish', pin: '123456' } }))
ok(admin.status === 200 && admin.json.accessToken, 'aashish / 123456 logs in as admin')
ok(admin.json.user?.roles?.some((r) => r.role === 'admin'), 'aashish has admin role')
const adminTok = admin.json.accessToken

// public departments for the signup form
const deps = await call('GET', '/api/v1/auth/departments')
ok(deps.status === 200 && deps.json.departments.length === 11, 'public departments list (no auth)')
const laser = deps.json.departments.find((d) => d.code === 'LASER')

// signup
const su = await call('POST', '/api/v1/auth/signup', { body: { phone, fullName: 'Test Operator', departmentId: laser.id, pin: '246810' } })
ok(su.status === 201 && su.json.user.status === 'pending', 'signup → 201 pending')
const newId = su.json.user.id

// duplicate signup → 409
const dup = await call('POST', '/api/v1/auth/signup', { body: { phone, fullName: 'Dup Name', departmentId: laser.id, pin: '111111' } })
ok(dup.status === 409, `duplicate phone → 409 (got ${dup.status})`)

// pending user cannot log in (correct PIN, but not approved)
const pend = await call('POST', '/api/v1/auth/login', { body: { username: phone, pin: '246810' } })
ok(pend.status === 403 && pend.json.error === 'account_pending', 'pending user login → 403 account_pending')

// wrong PIN on pending account → generic invalid (no status leak)
const wrong = await call('POST', '/api/v1/auth/login', { body: { username: phone, pin: '000000' } })
ok(wrong.status === 401 && wrong.json.error === 'invalid_credentials', 'wrong PIN → 401 (no status leak)')

// admin sees the pending user
const pendingList = await call('GET', '/api/v1/users?status=pending', { token: adminTok })
ok(pendingList.status === 200 && pendingList.json.users.some((u) => u.id === newId), 'admin sees pending user')
const me = pendingList.json.users.find((u) => u.id === newId)
ok(me?.roles?.[0]?.department?.code === 'LASER', 'pending user bound to chosen department (LASER)')

// non-admin cannot list users
const laserTok = (await call('POST', '/api/v1/auth/login', { body: { username: 'laser', pin: '123456' } })).json.accessToken
ok((await call('GET', '/api/v1/users', { token: laserTok })).status === 403, 'non-admin GET /users → 403')

// approve
const appr = await call('POST', `/api/v1/users/${newId}/approve`, { token: adminTok })
ok(appr.status === 200 && appr.json.ok, `admin approve → ok (got ${appr.status} ${JSON.stringify(appr.json)})`)

// now login works
const live = await call('POST', '/api/v1/auth/login', { body: { username: phone, pin: '246810' } })
ok(live.status === 200 && live.json.accessToken, 'approved user can now log in')
ok(live.json.user.roles.some((r) => r.role === 'dept_head'), 'approved user has dept_head role')

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
