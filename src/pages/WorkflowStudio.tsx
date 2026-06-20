import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  applyNodeChanges, applyEdgeChanges, addEdge,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  getWorkflowVersions, getDepartments, createWorkflowDraft, updateWorkflowDraft, deleteWorkflowDraft, publishWorkflowVersion,
  type WorkflowVersionFull, type StageType, type StageDraft, type WorkflowGraph,
} from '../lib/api'
import './OrdersDesktop.css'
import './WorkflowStudio.css'

// Workflow Studio — visual node-graph canvas (editor ring 2, docs/11). Stages are
// nodes; edges are drawn connections (branches / parallel paths / loops). Routing
// still uses the linear `stages` projection (left→right by x), so editing the graph
// never re-routes jobs already on the floor (R5). Visual-branching-first.
const STAGE_TYPES: { value: StageType; label: string }[] = [
  { value: 'sales', label: 'Sales' }, { value: 'ppc_requirements', label: 'PPC requirements' }, { value: 'fg_check', label: 'FG check' },
  { value: 'design', label: 'Design' }, { value: 'ppc_final', label: 'PPC final' }, { value: 'production', label: 'Production' },
  { value: 'qc', label: 'QC' }, { value: 'fg_stock', label: 'FG Stock' }, { value: 'dispatch', label: 'Dispatch' }, { value: 'maintenance', label: 'Maintenance' },
]
const DEFAULT_DEPT_CODE: Partial<Record<StageType, string>> = { design: 'DESIGN', production: 'PRODUCTION', qc: 'QC', fg_stock: 'FG_STOCK', ppc_requirements: 'PPC', ppc_final: 'PPC', sales: 'SALES', fg_check: 'FG_STOCK', maintenance: 'MAINTENANCE' }
const REQUIRES_DEPT = new Set<StageType>(['design', 'production', 'qc', 'fg_stock'])
const newKey = () => Math.random().toString(36).slice(2)
const typeLabel = (t: StageType) => STAGE_TYPES.find((x) => x.value === t)?.label ?? t

type StageData = { label: string; stageType: StageType; departmentId: string | null; deptName: string | null }
type SNode = Node<StageData>

function lintStages(types: StageType[]): string[] {
  const w: string[] = []
  if (!types.includes('production')) w.push('No Production stage — nothing gets made.')
  if (!types.includes('fg_stock')) w.push('No FG Stock stage — jobs can never be closed.')
  else if (types[types.length - 1] !== 'fg_stock') w.push('FG Stock is not the last (right-most) stage — it normally ends the flow.')
  const di = types.indexOf('design'), pi = types.indexOf('production')
  if (di >= 0 && pi >= 0 && di > pi) w.push('Design comes after Production — usually design is first.')
  const seen = new Set<string>(), dup = new Set<string>()
  for (const t of types) { if (seen.has(t)) dup.add(t); seen.add(t) }
  if (dup.size) w.push(`Duplicate stage type${dup.size > 1 ? 's' : ''}: ${[...dup].join(', ')}.`)
  return w
}

// custom node: shows the stage label + type + department, coloured by type
function StageNode({ data, selected }: NodeProps<SNode>) {
  return (
    <div className={`wsn wfm__node--${data.stageType} ${selected ? 'wsn--sel' : ''} ${REQUIRES_DEPT.has(data.stageType) && !data.departmentId ? 'wsn--bad' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="wsn__label">{data.label || '(unnamed)'}</div>
      <div className="wsn__sub">{typeLabel(data.stageType)}{data.deptName ? ` · ${data.deptName}` : REQUIRES_DEPT.has(data.stageType) ? ' · ⚠ no dept' : ''}</div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
const nodeTypes = { stage: StageNode }

export default function WorkflowStudio() {
  const [versions, setVersions] = useState<WorkflowVersionFull[] | null>(null)
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [depts, setDepts] = useState<{ id: string; code: string; name: string }[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [nodes, setNodes] = useState<SNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selNode, setSelNode] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const deptName = useCallback((id: string | null) => (id ? depts.find((d) => d.id === id)?.name ?? null : null), [depts])
  const deptByCode = (code?: string) => (code ? depts.find((d) => d.code === code)?.id ?? null : null)

  const buildCanvas = useCallback((v: WorkflowVersionFull): { nodes: SNode[]; edges: Edge[] } => {
    const g = v.graph
    const mk = (id: string, x: number, y: number, st: StageType, dep: string | null, label: string): SNode =>
      ({ id, type: 'stage', position: { x, y }, data: { label, stageType: st, departmentId: dep, deptName: depts.find((d) => d.id === dep)?.name ?? null } })
    if (g?.nodes?.length) {
      return {
        nodes: g.nodes.map((n) => mk(n.id, n.x, n.y, n.stageType, n.departmentId, n.label)),
        edges: (g.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target })),
      }
    }
    // legacy version with no graph yet → auto-layout the linear stages
    const ns = v.stages.map((s, i) => mk(s.id || newKey(), i * 240, 90, s.stageType as StageType, s.departmentId, s.label))
    const es = ns.slice(1).map((n, i) => ({ id: `e-${ns[i].id}-${n.id}`, source: ns[i].id, target: n.id }))
    return { nodes: ns, edges: es }
  }, [depts])

  const selectVersion = useCallback((v: WorkflowVersionFull) => {
    setSelId(v.id); setErr(null); setMsg(null); setDirty(false); setSelNode(null)
    const c = buildCanvas(v); setNodes(c.nodes); setEdges(c.edges)
  }, [buildCanvas])

  async function load(selectId?: string) {
    const [v, d] = await Promise.all([getWorkflowVersions(), getDepartments()])
    setVersions(v.versions); setPublishedId(v.publishedVersionId); setDepts(d.departments)
    const pick = v.versions.find((x) => x.id === selectId) ?? v.versions.find((x) => x.id === v.publishedVersionId) ?? v.versions[0] ?? null
    if (pick) { setSelId(pick.id); setDirty(false); setSelNode(null) } // canvas built by the effect below once depts are in state
    return pick?.id ?? null
  }
  useEffect(() => { load().catch(() => setVersions([])) /* eslint-disable-next-line */ }, [])
  // rebuild the canvas whenever the selected version or departments change
  useEffect(() => {
    const v = versions?.find((x) => x.id === selId)
    if (v && !dirty) { const c = buildCanvas(v); setNodes(c.nodes); setEdges(c.edges) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId, depts, versions])

  const selected = versions?.find((x) => x.id === selId) ?? null
  const isDraft = selected?.status === 'draft'

  // ── canvas interaction (draft only) ───────────────────────────────────────
  const onNodesChange = useCallback((ch: NodeChange<SNode>[]) => {
    setNodes((nds) => applyNodeChanges(ch, nds))
    if (isDraft && ch.some((c) => c.type === 'remove' || c.type === 'position')) setDirty(true)
  }, [isDraft])
  const onEdgesChange = useCallback((ch: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(ch, eds))
    if (isDraft && ch.some((c) => c.type === 'remove')) setDirty(true)
  }, [isDraft])
  const onConnect = useCallback((c: Connection) => { setEdges((eds) => addEdge(c, eds)); setDirty(true) }, [])

  const patchNode = (id: string, data: Partial<StageData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)))
    setDirty(true); setMsg(null)
  }
  const onNodeType = (id: string, t: StageType) => {
    const dep = deptByCode(DEFAULT_DEPT_CODE[t])
    const n = nodes.find((x) => x.id === id)
    patchNode(id, { stageType: t, departmentId: dep, deptName: deptName(dep), label: n?.data.label || typeLabel(t) })
  }
  const addStage = () => {
    const id = newKey()
    const x = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) + 240 : 40
    setNodes((nds) => [...nds, { id, type: 'stage', position: { x, y: 90 }, data: { label: 'Production', stageType: 'production', departmentId: deptByCode('PRODUCTION'), deptName: deptName(deptByCode('PRODUCTION')) } }])
    setSelNode(id); setDirty(true)
  }
  const removeNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id)); setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setSelNode(null); setDirty(true)
  }

  // ── derive routing stages (left→right) + graph for save ───────────────────
  const orderedTypes = [...nodes].sort((a, b) => a.position.x - b.position.x).map((n) => n.data.stageType)
  const warnings = isDraft ? lintStages(orderedTypes) : []
  const badDept = nodes.some((n) => REQUIRES_DEPT.has(n.data.stageType) && !n.data.departmentId)
  const validEdit = nodes.length > 0 && nodes.every((n) => n.data.label.trim()) && !badDept

  const toStagesGraph = (): { stages: StageDraft[]; graph: WorkflowGraph } => {
    const ordered = [...nodes].sort((a, b) => a.position.x - b.position.x)
    return {
      stages: ordered.map((n) => ({ stageType: n.data.stageType, departmentId: n.data.departmentId, label: n.data.label.trim() })),
      graph: {
        nodes: nodes.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), stageType: n.data.stageType, departmentId: n.data.departmentId, label: n.data.label })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      },
    }
  }

  async function run(fn: () => Promise<unknown>, after?: string) {
    setBusy(true); setErr(null); setMsg(null)
    try { await fn(); if (after) setMsg(after) }
    catch (e) { setErr(e instanceof Error ? e.message : 'failed') }
    finally { setBusy(false) }
  }
  const saveDraft = () => { if (!selId || !validEdit) return; const { stages, graph } = toStagesGraph(); run(async () => { await updateWorkflowDraft(selId, stages, undefined, graph); await load(selId) }, 'Draft saved') }
  function publish() {
    if (!selId || !selected) return
    const live = versions?.find((x) => x.id === publishedId)
    const liveSeq = live ? live.stages.map((s) => s.label).join('  →  ') : '(none yet)'
    const newSeq = orderedTypes.length ? [...nodes].sort((a, b) => a.position.x - b.position.x).map((n) => n.data.label).join('  →  ') : selected.stages.map((s) => s.label).join('  →  ')
    const ok = window.confirm(
      `Publish v${selected.version} as the LIVE workflow?\n\n` +
      `Currently live${live ? ` (v${live.version})` : ''}:\n  ${liveSeq}\n\n` +
      `Publishing (v${selected.version}, routing order):\n  ${newSeq}\n\n` +
      (warnings.length ? `⚠ Warnings:\n${warnings.map((w) => `  • ${w}`).join('\n')}\n\n` : '') +
      `Future jobs use the new flow. Jobs already on the floor keep their original route.`,
    )
    if (!ok) return
    run(async () => { if (isDraft && dirty) { const { stages, graph } = toStagesGraph(); await updateWorkflowDraft(selId, stages, undefined, graph) } await publishWorkflowVersion(selId); await load(selId) }, 'Published — now the live workflow')
  }
  const rollback = (id: string) => run(async () => { await publishWorkflowVersion(id); await load(id) }, 'Rolled back')
  const del = (id: string) => run(async () => { await deleteWorkflowDraft(id); await load() }, 'Draft deleted')
  const newDraft = () => run(async () => {
    const base = versions?.find((x) => x.id === publishedId) ?? selected
    const c = base ? buildCanvas(base) : { nodes: [] as SNode[], edges: [] as Edge[] }
    const stages: StageDraft[] = (c.nodes.length ? [...c.nodes].sort((a, b) => a.position.x - b.position.x) : []).map((n) => ({ stageType: n.data.stageType, departmentId: n.data.departmentId, label: n.data.label }))
    const graph: WorkflowGraph = { nodes: c.nodes.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), stageType: n.data.stageType, departmentId: n.data.departmentId, label: n.data.label })), edges: c.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) }
    const r = await createWorkflowDraft(stages.length ? stages : [{ stageType: 'design', departmentId: deptByCode('DESIGN'), label: 'Design' }], 'New draft', graph.nodes?.length ? graph : undefined)
    await load(r.version.id)
  }, 'New draft created')
  const cloneToDraft = () => selected && run(async () => {
    const c = buildCanvas(selected)
    const stages: StageDraft[] = [...c.nodes].sort((a, b) => a.position.x - b.position.x).map((n) => ({ stageType: n.data.stageType, departmentId: n.data.departmentId, label: n.data.label }))
    const graph: WorkflowGraph = { nodes: c.nodes.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y), stageType: n.data.stageType, departmentId: n.data.departmentId, label: n.data.label })), edges: c.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })) }
    const r = await createWorkflowDraft(stages, `Clone of v${selected.version}`, graph)
    await load(r.version.id)
  }, 'Cloned to a new draft')

  const sel = nodes.find((n) => n.id === selNode) ?? null
  const liveV = versions?.find((x) => x.id === publishedId)

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">Workflow Studio</h1>
        <span className="dw__sub">{selected ? `editing v${selected.version} · ${selected.status}${liveV ? ` · live = v${liveV.version}` : ''}` : 'loading…'}</span>
        <button className="ord__btn ord__btn--ghost" style={{ marginLeft: 'auto' }} disabled={busy} onClick={newDraft}>＋ New draft</button>
      </div>
      {(msg || err) && <p className="wstu__flash" style={{ color: err ? 'var(--red)' : 'var(--lime-ink)' }}>{err || msg}</p>}

      {!versions ? <div className="dw__empty">Loading…</div> : (
        <div className="wstu">
          {/* version history rail */}
          <aside className="wstu__versions">
            <h3 className="dwm__ttl">Versions</h3>
            {versions.map((v) => (
              <button key={v.id} className={`wstu__ver ${v.id === selId ? 'is-sel' : ''}`} onClick={() => selectVersion(v)}>
                <span className="wstu__vno">v{v.version}</span>
                <span className={`wstu__vstatus wstu__vstatus--${v.status}`}>{v.id === publishedId ? '★ live' : v.status}</span>
                <span className="wstu__vnote">{v.stages.length} stage{v.stages.length === 1 ? '' : 's'}{v.note ? ` · ${v.note}` : ''}</span>
              </button>
            ))}
          </aside>

          {/* canvas */}
          <div className="wstu__canvas">
            <div className="wstu__rf">
              <ReactFlow
                nodes={nodes} edges={edges} nodeTypes={nodeTypes}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={isDraft ? onConnect : undefined}
                onNodeClick={(_, n) => setSelNode(n.id)} onPaneClick={() => setSelNode(null)}
                nodesDraggable={isDraft} nodesConnectable={isDraft} elementsSelectable deleteKeyCode={isDraft ? ['Delete'] : null}
                fitView proOptions={{ hideAttribution: true }}
              >
                <Background gap={18} color="#d8cfc0" />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeStrokeWidth={3} />
              </ReactFlow>

              {/* floating toolbar + selected-node editor (draft only) */}
              {isDraft && (
                <>
                  <button className="wstu__add wstu__add--float" onClick={addStage}>＋ Add stage</button>
                  {sel && (
                    <div className="wstu__inspector">
                      <div className="wstu__insp-head"><b>Edit stage</b><button className="wstu__insp-x" onClick={() => setSelNode(null)}>×</button></div>
                      <label className="wstu__f"><span>Label</span><input value={sel.data.label} onChange={(e) => patchNode(sel.id, { label: e.target.value })} /></label>
                      <label className="wstu__f"><span>Type</span>
                        <select value={sel.data.stageType} onChange={(e) => onNodeType(sel.id, e.target.value as StageType)}>
                          {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </label>
                      <label className="wstu__f"><span>Department{REQUIRES_DEPT.has(sel.data.stageType) ? ' *' : ''}</span>
                        <select className={REQUIRES_DEPT.has(sel.data.stageType) && !sel.data.departmentId ? 'wstu__sel--bad' : ''} value={sel.data.departmentId ?? ''} onChange={(e) => patchNode(sel.id, { departmentId: e.target.value || null, deptName: deptName(e.target.value || null) })}>
                          <option value="">— none —</option>
                          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </label>
                      <button className="ord__btn ord__btn--danger" style={{ width: '100%' }} onClick={() => removeNode(sel.id)}>Remove stage</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {warnings.length > 0 && <div className="wstu__warns">{warnings.map((w) => <div key={w} className="wstu__warn">⚠ {w}</div>)}</div>}

            <div className="wstu__actions">
              {isDraft ? (
                <>
                  <button className="ord__btn ord__btn--ghost" disabled={busy} onClick={() => del(selId!)}>Delete draft</button>
                  <span className="wstu__hint">Drag to arrange · drag node edges to connect · routing follows left→right order</span>
                  <div style={{ flex: 1 }} />
                  <button className="ord__btn" disabled={busy || !dirty || !validEdit} onClick={saveDraft}>{dirty ? 'Save draft' : 'Saved'}</button>
                  <button className="ord__btn ord__btn--solid" disabled={busy || !validEdit} onClick={publish}>▲ Publish → live</button>
                </>
              ) : (
                <>
                  {selected && selected.id !== publishedId && <button className="ord__btn ord__btn--solid" disabled={busy} onClick={() => rollback(selected.id)}>↺ Roll back to v{selected.version}</button>}
                  <span className="wstu__hint">{selected?.id === publishedId ? 'Live workflow (read-only). Clone to a draft to edit.' : 'Archived version. Roll back or clone to edit.'}</span>
                  <div style={{ flex: 1 }} />
                  <button className="ord__btn" disabled={busy} onClick={cloneToDraft}>Clone to editable draft</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
