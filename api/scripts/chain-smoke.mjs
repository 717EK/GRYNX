const B='http://localhost:4000'
let pass=0,fail=0; const ok=(c,m)=>(c?(pass++,console.log('  ✓ '+m)):(fail++,console.error('  ✗ '+m)))
const login=async(u)=>(await(await fetch(B+'/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,pin:'123456'})})).json()).accessToken
const call=async(m,p,tok,body)=>{const r=await fetch(B+p,{method:m,headers:{...(body?{'Content-Type':'application/json'}:{}),...(tok?{Authorization:'Bearer '+tok}:{})},body:body?JSON.stringify(body):undefined});const t=await r.text();return{s:r.status,j:t?JSON.parse(t):null}}
const scan=(tok,code)=>call('POST','/api/v1/scan',tok,{jobNo:code,idempotencyKey:crypto.randomUUID(),clientTs:new Date().toISOString()})
;(async()=>{
  const admin=await login('aashish')
  const at=(await call('GET','/api/v1/products',admin)).j.products.find(p=>p.code==='AT')
  const m=at.models.find(x=>x.code==='LD38')
  const {job}=(await call('POST','/api/v1/jobs',admin,{productId:at.id,priority:'normal',models:[{modelId:m.id,size:'3M',quantity:10}]})).j
  const code=job.displayLabel
  ok(!!code,'created job '+code)
  // scan through pipeline to QC: design,laser,alloy_prod,cnc_vmc,powder,qc
  for(const u of ['design','laser','alloy_prod','cnc_vmc','powder','qc']){const t=await login(u);const r=await scan(t,code);if(r.j.result!=='applied')console.log('   scan '+u+' ->',r.j.result)}
  // now job at QC (qc step in_progress). QC approve -> FG
  const qc=await login('qc')
  const qq=await call('GET','/api/v1/qc/queue',qc); ok(qq.j.jobs.some(x=>x.displayLabel===code),'job appears in QC queue')
  const jobId=qq.j.jobs.find(x=>x.displayLabel===code)?.id
  const appr=await call('POST','/api/v1/qc/'+jobId+'/approve',qc,{notes:'looks good'}); ok(appr.s===200,'QC approve ok')
  // FG queue
  const fg=await login('fg')
  const fq=await call('GET','/api/v1/fg/queue',fg); ok(fq.j.jobs.some(x=>x.id===jobId),'job appears in FG queue')
  const sp='SN-'+Date.now().toString().slice(-6)+'-'; const ser=await call('POST','/api/v1/fg/'+jobId+'/serials',fg,{serials:[sp+'1',sp+'2',sp+'3']}); ok(ser.j.added===3,'FG added 3 serials')
  const clo=await call('POST','/api/v1/fg/'+jobId+'/closure',fg,{receivedQty:10}); ok(clo.s===200,'FG requested closure')
  // admin approves closure
  const ca=await call('POST','/api/v1/fg/closure/'+jobId+'/approve',admin); ok(ca.s===200,'admin approved closure')
  const detail=await call('GET','/api/v1/jobs/'+jobId,admin); ok(detail.j.job.status==='closed','job is now CLOSED')
  // purchase: log material
  const pj=await call('GET','/api/v1/purchase/jobs',admin); ok(pj.j.jobs.length>0,'purchase jobs list')
  const lm=await call('POST','/api/v1/purchase/'+pj.j.jobs[0].id+'/materials',admin,{item:'AL tube 50mm',vendor:'Hindalco',batchRef:'BATCH-77',quantity:'120 kg'}); ok(lm.s===201,'logged material')
  const byb=await call('GET','/api/v1/purchase/by-batch/BATCH-77',admin); ok(byb.j.usages.length>0,'genealogy search by batch finds it')
  // notifications
  const notif=await call('GET','/api/v1/notifications',admin); ok(notif.j.notifications.length>0,'admin has notifications ('+notif.j.notifications.length+')')
  console.log('\n'+(fail===0?'✅':'❌')+' '+pass+' passed, '+fail+' failed')
  process.exit(fail?1:0)
})().catch(e=>{console.log('ERR',e.message);process.exit(1)})
