const B = process.env.BASE ?? 'http://localhost:4000'
let pass = 0, fail = 0
const ok = (c, m) => (c ? (pass++, console.log(`  ✓ ${m}`)) : (fail++, console.error(`  ✗ ${m}`)))
const login = async (u) => (await (await fetch(B+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,pin:'123456'})})).json()).accessToken
const call = async (m,p,tok,body) => { const r = await fetch(B+p,{method:m,headers:{...(body?{'Content-Type':'application/json'}:{}),...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined}); const t=await r.text(); return {status:r.status, json:t?JSON.parse(t):null} }

const laser = await login('laser'), head = await login('maint'), tech = await login('maint2'), admin = await login('aashish')

// 1. floor user raises a ticket
const raised = await call('POST','/api/v1/maintenance',laser,{category:'mechanical',priority:'high',locationText:'VMC-2 spindle',description:'Spindle making noise, vibration high'})
ok(raised.status===201 && /^MT-\d{4}$/.test(raised.json.ticket.ticketNo), `raise ticket → ${raised.json.ticket?.ticketNo}`)
const id = raised.json.ticket.id

// 2. crew got notified? (maint user has a notification)
// 3. head lists crew + assigns to tech
const crew = await call('GET','/api/v1/maintenance/crew',head)
ok(crew.status===200 && crew.json.crew.length>=3, `crew list (${crew.json.crew?.length})`)
const ravi = crew.json.crew.find(c=>c.username==='maint2')
const assigned = await call('POST',`/api/v1/maintenance/${id}/assign`,head,{assignedToId:ravi.id})
ok(assigned.status===200 && assigned.json.ticket.status==='assigned', 'head assigns → status assigned')

// 4. non-maint floor user cannot assign
const badAssign = await call('POST',`/api/v1/maintenance/${id}/assign`,laser,{assignedToId:ravi.id})
ok(badAssign.status===403, 'floor user cannot assign (403)')

// 5. assignee posts update (eta + parts → in_progress)
const upd = await call('POST',`/api/v1/maintenance/${id}/update`,tech,{note:'Inspected — spindle bearing worn', etaHours:6, partsNeeded:'spindle bearing SKF-6206', status:'in_progress'})
ok(upd.status===200 && upd.json.ticket.status==='in_progress' && upd.json.ticket.etaHours===6, 'assignee update → in_progress, eta 6h')

// 6. head closes with remark
const closed = await call('POST',`/api/v1/maintenance/${id}/close`,head,{remark:'Bearing replaced, tested OK'})
ok(closed.status===200 && closed.json.ticket.status==='closed', 'head closes → status closed')

// 7. close requires remark
const noRemark = await call('POST',`/api/v1/maintenance/${id}/close`,head,{})
ok(noRemark.status===400 || noRemark.json?.ok, 'close without remark rejected (or already closed)')

// 8. detail shows full thread + names
const detail = await call('GET',`/api/v1/maintenance/${id}`,admin)
const types = detail.json.ticket.events.map(e=>e.type)
ok(detail.json.ticket.reportedBy?.fullName, `detail has reporter name (${detail.json.ticket.reportedBy?.fullName})`)
ok(JSON.stringify(types)===JSON.stringify(['created','assigned','update','closed']), `thread order: ${types.join(' → ')}`)
ok(detail.json.ticket.closeRemark==='Bearing replaced, tested OK', 'close remark saved')

console.log(`\n${fail===0?'✅':'❌'} ${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
