import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, Handle, Position, applyNodeChanges, type Node, type Edge, type NodeChange, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  getApps, createApp, getAppVersions, createAppVersion, updateAppVersion, publishAppVersion,
  listRecords, createRecord, deleteRecord,
  type AppSummary, type AppVersionFull, type AppDefinition, type AppEntity, type AppField, type AppFieldType, type AppRecordRow,
} from '../lib/api'
import './OrdersDesktop.css'
import './AppStudio.css'

// App Studio — Data pillar (docs/13 Phase 1). Model entities as a node-graph (ER),
// store records through the definition-driven runtime. SuperUser only. Beside GRYNX.
const FIELD_TYPES: AppFieldType[] = ['text', 'number', 'boolean', 'date', 'datetime', 'select', 'relation', 'json', 'file']
const newKey = () => Math.random().toString(36).slice(2)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'field'

type EData = { entity: AppEntity }
type ENode = Node<EData>

function EntityNode({ data, selected }: NodeProps<ENode>) {
  const e = data.entity
  return (
    <div className={`asn ${selected ? 'asn--sel' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="asn__hd">{e.name}<span className="asn__key">{e.key}</span></div>
      <div className="asn__fields">
        {e.fields.length === 0 ? <div className="asn__empty">no fields</div> : e.fields.map((f) => (
          <div key={f.key} className="asn__f">
            <span className="asn__fn">{f.name}</span>
            <span className="asn__ft">{f.type}{f.required ? ' ·req' : ''}{f.unique ? ' ·uniq' : ''}{f.type === 'relation' && f.to ? ` →${f.to}` : ''}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
const nodeTypes = { entity: EntityNode }

export default function AppStudio() {
  const [apps, setApps] = useState<AppSummary[] | null>(null)
  const [appKey, setAppKey] = useState<string>('')
  const [versions, setVersions] = useState<AppVersionFull[]>([])
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [def, setDef] = useState<AppDefinition>({ entities: [] })
  const [nodes, setNodes] = useState<ENode[]>([])
  const [selKey, setSelKey] = useState<string | null>(null)
  const [tab, setTab] = useState<'model' | 'data'>('model')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // data tab
  const [dataEntity, setDataEntity] = useState<string>('')
  const [records, setRecords] = useState<AppRecordRow[]>([])
  const [form, setForm] = useState<Record<string, unknown>>({})

  const entities = def.entities ?? []
  const sel = entities.find((e) => e.key === selKey) ?? null

  const buildNodes = useCallback((d: AppDefinition): ENode[] => {
    const pos = Object.fromEntries((d.graph?.nodes ?? []).map((n) => [n.id, n]))
    return (d.entities ?? []).map((e, i) => ({ id: e.key, type: 'entity', position: { x: pos[e.key]?.x ?? (i % 3) * 280 + 40, y: pos[e.key]?.y ?? Math.floor(i / 3) * 240 + 40 }, data: { entity: e } }))
  }, [])
  const edges = useMemo<Edge[]>(() => entities.flatMap((e) => e.fields.filter((f) => f.type === 'relation' && f.to && entities.some((x) => x.key === f.to)).map((f) => ({ id: `${e.key}.${f.key}->${f.to}`, source: e.key, target: f.to!, label: f.key }))), [entities])

  async function load(selectKey?: string) {
    const r = await getApps(); setApps(r.apps)
    const pick = r.apps.find((a) => a.key === (selectKey ?? appKey)) ?? r.apps.find((a) => a.key === 'grynx') ?? r.apps[0]
    if (!pick) { setAppKey(''); return }
    setAppKey(pick.key)
    const v = await getAppVersions(pick.key)
    setVersions(v.versions); setPublishedId(v.publishedVersionId)
    const draft = v.versions.find((x) => x.status === 'draft')
    const base = draft ?? v.versions.find((x) => x.id === v.publishedVersionId) ?? v.versions[0]
    setDraftId(draft?.id ?? null)
    const d: AppDefinition = base?.definition ?? { entities: [] }
    setDef(d); setNodes(buildNodes(d)); setDirty(false); setSelKey(null)
    setDataEntity((d.entities ?? [])[0]?.key ?? '')
  }
  useEffect(() => { load().catch(() => setApps([])) /* eslint-disable-next-line */ }, [])
  useEffect(() => { if (tab === 'data' && appKey && dataEntity) listRecords(appKey, dataEntity).then((r) => setRecords(r.records)).catch(() => setRecords([])) }, [tab, appKey, dataEntity])

  // graph from def changes (entity add/remove) — keep node positions for existing
  useEffect(() => { setNodes((cur) => { const pos = Object.fromEntries(cur.map((n) => [n.id, n.position])); return buildNodes({ ...def, graph: { nodes: Object.entries(pos).map(([id, p]) => ({ id, x: p.x, y: p.y })) } }) }) /* eslint-disable-next-line */ }, [def.entities])

  const mutate = (fn: (e: AppEntity[]) => AppEntity[]) => { setDef((d) => ({ ...d, entities: fn([...(d.entities ?? [])]) })); setDirty(true); setMsg(null) }
  const onNodesChange = useCallback((ch: NodeChange<ENode>[]) => { setNodes((nds) => applyNodeChanges(ch, nds)); if (ch.some((c) => c.type === 'position')) setDirty(true) }, [])

  function addEntity() {
    const n = entities.length + 1
    const e: AppEntity = { key: `entity_${n}`, name: `Entity ${n}`, storage: { kind: 'native' }, fields: [{ key: 'name', name: 'Name', type: 'text', required: true }] }
    mutate((es) => [...es, e]); setSelKey(e.key)
  }
  const patchEntity = (key: string, p: Partial<AppEntity>) => mutate((es) => es.map((e) => (e.key === key ? { ...e, ...p } : e)))
  const removeEntity = (key: string) => { mutate((es) => es.filter((e) => e.key !== key)); setSelKey(null) }
  const addField = (eKey: string) => patchEntity(eKey, { fields: [...(entities.find((e) => e.key === eKey)?.fields ?? []), { key: 'field_' + newKey().slice(0, 4), name: 'New field', type: 'text' }] })
  const patchField = (eKey: string, fKey: string, p: Partial<AppField>) => { const e = entities.find((x) => x.key === eKey); if (!e) return; patchEntity(eKey, { fields: e.fields.map((f) => (f.key === fKey ? { ...f, ...p } : f)) }) }
  const removeField = (eKey: string, fKey: string) => { const e = entities.find((x) => x.key === eKey); if (!e) return; patchEntity(eKey, { fields: e.fields.filter((f) => f.key !== fKey) }) }

  const graphOf = (): AppDefinition['graph'] => ({ nodes: nodes.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) })), edges: [] })
  async function run(fn: () => Promise<unknown>, after?: string) { setBusy(true); setErr(null); setMsg(null); try { await fn(); if (after) setMsg(after) } catch (e) { setErr(e instanceof Error ? e.message : 'failed') } finally { setBusy(false) } }
  const save = () => run(async () => {
    const full: AppDefinition = { ...def, graph: graphOf() }
    if (draftId) await updateAppVersion(appKey, draftId, full, 'edit')
    else { const r = await createAppVersion(appKey, full, 'draft'); setDraftId(r.version.id) }
    await load(appKey)
  }, 'Saved draft')
  const publish = () => run(async () => {
    const full: AppDefinition = { ...def, graph: graphOf() }
    let id = draftId
    if (id) await updateAppVersion(appKey, id, full, 'edit')
    else { const r = await createAppVersion(appKey, full, 'draft'); id = r.version.id }
    await publishAppVersion(appKey, id!); await load(appKey)
  }, 'Published — app schema is live')
  const newApp = () => run(async () => { await createApp('grynx', 'GRYNX'); await load('grynx') }, 'App created')

  // data tab actions
  const dataE = entities.find((e) => e.key === dataEntity)
  async function addRecord() {
    if (!dataE) return
    await run(async () => { await createRecord(appKey, dataEntity, form); setForm({}); const r = await listRecords(appKey, dataEntity); setRecords(r.records) }, 'Record added')
  }
  const delRecord = (id: string) => run(async () => { await deleteRecord(appKey, dataEntity, id); setRecords((rs) => rs.filter((x) => x.id !== id)) })

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">App Studio</h1>
        <span className="dw__sub">{appKey ? `${appKey} · data model${draftId ? ' · draft' : publishedId ? ' · live' : ''}` : 'no app yet'}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {appKey && <div className="as__tabs"><button className={tab === 'model' ? 'is-on' : ''} onClick={() => setTab('model')}>Model</button><button className={tab === 'data' ? 'is-on' : ''} onClick={() => setTab('data')}>Data</button></div>}
        </div>
      </div>
      {(msg || err) && <p className="wstu__flash" style={{ color: err ? 'var(--red)' : 'var(--lime-ink)' }}>{err || msg}</p>}

      {apps === null ? <div className="dw__empty">Loading…</div> : !appKey ? (
        <div className="dw__empty">No app yet. <button className="ord__btn ord__btn--solid" style={{ marginLeft: 10 }} disabled={busy} onClick={newApp}>＋ Create the GRYNX app</button></div>
      ) : tab === 'model' ? (
        <div className="as">
          <div className="as__canvas">
            <div className="as__rf">
              <ReactFlow key={`${appKey}:${entities.length}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeClick={(_, n) => setSelKey(n.id)} onPaneClick={() => setSelKey(null)} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }} proOptions={{ hideAttribution: true }}>
                <Background gap={18} color="#d8cfc0" />
                <Controls showInteractive={false} />
              </ReactFlow>
              <button className="as__add" onClick={addEntity}>＋ Add entity</button>
              {sel && (
                <div className="as__insp">
                  <div className="as__insp-hd"><b>{sel.name}</b><button onClick={() => setSelKey(null)}>×</button></div>
                  <label className="as__f"><span>Entity name</span><input value={sel.name} onChange={(e) => patchEntity(sel.key, { name: e.target.value, key: slug(e.target.value) })} /></label>
                  <div className="as__f"><span>Fields</span></div>
                  <div className="as__flist">
                    {sel.fields.map((f) => (
                      <div key={f.key} className="as__fr">
                        <input className="as__fi" value={f.name} onChange={(e) => patchField(sel.key, f.key, { name: e.target.value, key: slug(e.target.value) })} />
                        <select className="as__fs" value={f.type} onChange={(e) => patchField(sel.key, f.key, { type: e.target.value as AppFieldType })}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                        <button className="as__chk" title="required" onClick={() => patchField(sel.key, f.key, { required: !f.required })} style={{ opacity: f.required ? 1 : 0.3 }}>req</button>
                        <button className="as__chk" title="unique" onClick={() => patchField(sel.key, f.key, { unique: !f.unique })} style={{ opacity: f.unique ? 1 : 0.3 }}>uniq</button>
                        <button className="as__del" onClick={() => removeField(sel.key, f.key)}>×</button>
                        {f.type === 'select' && <input className="as__opt" placeholder="options, comma-sep" value={(f.options ?? []).join(',')} onChange={(e) => patchField(sel.key, f.key, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />}
                        {f.type === 'relation' && <select className="as__opt" value={f.to ?? ''} onChange={(e) => patchField(sel.key, f.key, { to: e.target.value || undefined })}><option value="">→ entity…</option>{entities.filter((x) => x.key !== sel.key).map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}</select>}
                      </div>
                    ))}
                  </div>
                  <button className="ord__btn ord__btn--ghost" style={{ width: '100%', marginTop: 6 }} onClick={() => addField(sel.key)}>＋ Add field</button>
                  <button className="ord__btn ord__btn--danger" style={{ width: '100%', marginTop: 8 }} onClick={() => removeEntity(sel.key)}>Delete entity</button>
                </div>
              )}
            </div>
            <div className="wstu__actions">
              <span className="wstu__hint">Drag entities · click to edit fields · relations draw automatically. Records store through the live schema.</span>
              <div style={{ flex: 1 }} />
              <button className="ord__btn" disabled={busy || !dirty} onClick={save}>{dirty ? 'Save draft' : 'Saved'}</button>
              <button className="ord__btn ord__btn--solid" disabled={busy || entities.length === 0} onClick={publish}>▲ Publish schema</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="as__data">
          <div className="dw__toolbar" style={{ marginBottom: 10 }}>
            <select className="mnt__select" style={{ maxWidth: 220 }} value={dataEntity} onChange={(e) => setDataEntity(e.target.value)}>{entities.map((e) => <option key={e.key} value={e.key}>{e.name}</option>)}</select>
            <span className="dw__sub">{records.length} record{records.length === 1 ? '' : 's'}{publishedId ? '' : ' · publish the schema first'}</span>
          </div>
          {!dataE ? <div className="dw__empty">No entity selected.</div> : (
            <>
              <div className="as__addrec">
                {dataE.fields.map((f) => (
                  <label key={f.key} className="as__rf2"><span>{f.name}{f.required ? ' *' : ''}</span>
                    {f.type === 'boolean' ? <input type="checkbox" checked={!!form[f.key]} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.checked }))} />
                      : f.type === 'select' ? <select value={String(form[f.key] ?? '')} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}><option value="">—</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>
                      : <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={String(form[f.key] ?? '')} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))} />}
                  </label>
                ))}
                <button className="ord__btn ord__btn--solid" disabled={busy} onClick={addRecord}>＋ Add record</button>
              </div>
              <div className="as__tablewrap">
                <table className="dwa__tbl as__table">
                  <thead><tr>{dataE.fields.map((f) => <th key={f.key}>{f.name}</th>)}<th></th></tr></thead>
                  <tbody>
                    {records.length === 0 ? <tr><td colSpan={dataE.fields.length + 1} className="dw__empty">No records yet.</td></tr> : records.map((r) => (
                      <tr key={r.id}>{dataE.fields.map((f) => <td key={f.key}>{String(r[f.key] ?? '')}</td>)}<td><button className="as__del" onClick={() => delRecord(r.id)}>×</button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
