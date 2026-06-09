const B = 'http://localhost:4000'
let pass = 0, fail = 0
const ok = (c, m) => (c ? (pass++, console.log('  ✓ ' + m)) : (fail++, console.error('  ✗ ' + m)))
const login = async (u) => (await (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, pin: '123456' }) })).json()).accessToken
const call = async (m, p, tok, body) => { const r = await fetch(B + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { s: r.status, j: t ? JSON.parse(t) : null } }

;(async () => {
  const ppc = await login('ppc')
  const admin = await login('aashish')
  const at = (await call('GET', '/api/v1/products', admin)).j.products.find((p) => p.code === 'AT')
  const m1 = at.models.find((x) => x.code === 'LD38')
  const m2 = at.models.find((x) => x.code === 'LD30') || at.models[1]
  const mkInput = (model, qty, size) => ({ productId: at.id, priority: 'normal', models: [{ modelId: model.id, size, quantity: qty }] })

  // ── Path A: admin proposes edits → PPC confirms → admin approves ──────────
  const r1 = await call('POST', '/api/v1/ppc', ppc, mkInput(m1, 10, '3M'))
  const id1 = r1.j.request.id
  ok(r1.s === 201 && r1.j.request.status === 'submitted', 'PPC raised request ' + r1.j.request?.requestNo)

  const prop = await call('POST', `/api/v1/ppc/${id1}/propose`, admin, { ...mkInput(m1, 15, '3M'), note: 'bumped qty 10→15' })
  ok(prop.s === 200 && prop.j.request.status === 'pending_confirm', 'admin proposed edits → pending_confirm')
  ok(prop.j.request.models[0].quantity === 15, 'proposed qty saved (15)')

  const early = await call('POST', `/api/v1/ppc/${id1}/approve`, admin)
  ok(early.s === 409 && early.j.error === 'awaiting_ppc', 'approve blocked while awaiting PPC confirm')

  const mine = await call('GET', '/api/v1/ppc/mine', ppc)
  ok(mine.j.requests.some((x) => x.id === id1 && x.status === 'pending_confirm'), 'request shows in PPC inbox (pending_confirm)')

  const conf = await call('POST', `/api/v1/ppc/${id1}/confirm`, ppc)
  ok(conf.s === 200, 'PPC confirmed → back to admin')

  const appr1 = await call('POST', `/api/v1/ppc/${id1}/approve`, admin)
  ok(appr1.s === 201 && appr1.j.job, 'admin approved → job ' + appr1.j.job?.displayLabel)

  // ── Path B: admin RC (request change) → PPC resubmits → admin approves ────
  const r2 = await call('POST', '/api/v1/ppc', ppc, mkInput(m2, 8, '2M'))
  const id2 = r2.j.request.id
  ok(r2.s === 201, 'PPC raised request 2 ' + r2.j.request?.requestNo)

  const rc = await call('POST', `/api/v1/ppc/${id2}/request-change`, admin, { note: 'use LD38 instead' })
  ok(rc.s === 200, 'admin requested change (RC)')
  const after = await call('GET', `/api/v1/ppc/${id2}`, admin)
  ok(after.j.request.status === 'clarification' && after.j.request.clarificationNote === 'use LD38 instead', 'status clarification + note attached')

  const resub = await call('POST', `/api/v1/ppc/${id2}/resubmit`, ppc, mkInput(m1, 8, '3M'))
  ok(resub.s === 200 && resub.j.request.status === 'submitted', 'PPC resubmitted → back to admin queue')
  ok(resub.j.request.models[0].model.code === 'LD38', 'resubmit applied the requested model (LD38)')

  const appr2 = await call('POST', `/api/v1/ppc/${id2}/approve`, admin)
  ok(appr2.s === 201, 'admin approved resubmitted request → job ' + appr2.j.job?.displayLabel)

  // notifications reached PPC (proposal + RC + approvals)
  const pn = await call('GET', '/api/v1/notifications', ppc)
  ok(pn.j.notifications.length > 0, 'PPC has notifications (' + pn.j.notifications.length + ')')

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' passed, ' + fail + ' failed')
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.log('ERR', e.message); process.exit(1) })
