import { useEffect, useState } from 'react'
import {
  getWorkflowVersions, getDepartments, createWorkflowDraft, updateWorkflowDraft, deleteWorkflowDraft, publishWorkflowVersion,
  type WorkflowVersionFull, type StageType, type StageDraft,
} from '../lib/api'
import './OrdersDesktop.css'
import './WorkflowStudio.css'

// Workflow Studio (editor ring 1 / modular studio). A no-code canvas to edit the
// company pipeline as VERSIONED data: build a draft, publish it (the old version is
// archived), roll back to any version. Jobs snapshot the published version when
// created, so editing never re-routes jobs already on the floor (R5).
const STAGE_TYPES: { value: StageType; label: string }[] = [
  { value: 'sales', label: 'Sales' }, { value: 'ppc_requirements', label: 'PPC requirements' }, { value: 'fg_check', label: 'FG check' },
  { value: 'design', label: 'Design' }, { value: 'ppc_final', label: 'PPC final' }, { value: 'production', label: 'Production' },
  { value: 'qc', label: 'QC' }, { value: 'fg_stock', label: 'FG Stock' }, { value: 'dispatch', label: 'Dispatch' }, { value: 'maintenance', label: 'Maintenance' },
]
const DEFAULT_DEPT_CODE: Partial<Record<StageType, string>> = { design: 'DESIGN', production: 'PRODUCTION', qc: 'QC', fg_stock: 'FG_STOCK', ppc_requirements: 'PPC', ppc_final: 'PPC', sales: 'SALES', fg_check: 'FG_STOCK', maintenance: 'MAINTENANCE' }

type EditStage = { key: string; stageType: StageType; departmentId: string | null; label: string }
const newKey = () => Math.random().toString(36).slice(2)

export default function WorkflowStudio() {
  const [versions, setVersions] = useState<WorkflowVersionFull[] | null>(null)
  const [publishedId, setPublishedId] = useState<string | null>(null)
  const [depts, setDepts] = useState<{ id: string; code: string; name: string }[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditStage[] | null>(null) // working copy when a DRAFT is selected
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const deptByCode = (code?: string) => (code ? depts.find((d) => d.code === code)?.id ?? null : null)

  function selectVersion(v: WorkflowVersionFull) {
    setSelId(v.id); setErr(null); setMsg(null); setDirty(false)
    setEdit(v.status === 'draft' ? v.stages.map((s) => ({ key: newKey(), stageType: s.stageType as StageType, departmentId: s.departmentId, label: s.label })) : null)
  }

  async function load(selectId?: string) {
    const [v, d] = await Promise.all([getWorkflowVersions(), getDepartments()])
    setVersions(v.versions); setPublishedId(v.publishedVersionId); setDepts(d.departments)
    const pick = v.versions.find((x) => x.id === (selectId ?? selId)) ?? v.versions.find((x) => x.id === v.publishedVersionId) ?? v.versions[0] ?? null
    if (pick) {
      setSelId(pick.id); setDirty(false)
      setEdit(pick.status === 'draft' ? pick.stages.map((s) => ({ key: newKey(), stageType: s.stageType as StageType, departmentId: s.departmentId, label: s.label })) : null)
    }
  }
  useEffect(() => { load().catch(() => setVersions([])) /* eslint-disable-next-line */ }, [])

  const selected = versions?.find((x) => x.id === selId) ?? null
  const isDraft = selected?.status === 'draft'

  // editor ops (draft only)
  const patch = (mut: (s: EditStage[]) => EditStage[]) => { setEdit((cur) => (cur ? mut([...cur]) : cur)); setDirty(true); setMsg(null) }
  const setStage = (i: number, f: Partial<EditStage>) => patch((s) => { s[i] = { ...s[i], ...f }; return s })
  const onTypeChange = (i: number, t: StageType) => patch((s) => {
    const def = deptByCode(DEFAULT_DEPT_CODE[t])
    s[i] = { ...s[i], stageType: t, departmentId: def, label: s[i].label || STAGE_TYPES.find((x) => x.value === t)!.label }
    return s
  })
  const addStage = () => patch((s) => [...s, { key: newKey(), stageType: 'production', departmentId: deptByCode('PRODUCTION'), label: 'Production' }])
  const removeStage = (i: number) => patch((s) => s.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => patch((s) => { const j = i + dir; if (j < 0 || j >= s.length) return s; [s[i], s[j]] = [s[j], s[i]]; return s })

  const toDraft = (s: EditStage[]): StageDraft[] => s.map((x) => ({ stageType: x.stageType, departmentId: x.departmentId, label: x.label.trim() }))
  const validEdit = edit && edit.length > 0 && edit.every((s) => s.label.trim())

  async function run(fn: () => Promise<unknown>, after?: string) {
    setBusy(true); setErr(null); setMsg(null)
    try { await fn(); if (after) setMsg(after) }
    catch (e) { setErr(e instanceof Error ? e.message : 'failed') }
    finally { setBusy(false) }
  }
  const saveDraft = () => selId && edit && validEdit && run(async () => { await updateWorkflowDraft(selId, toDraft(edit)); await load(selId) }, 'Draft saved')
  const publish = () => selId && run(async () => { if (isDraft && dirty && edit) await updateWorkflowDraft(selId, toDraft(edit)); await publishWorkflowVersion(selId); await load(selId) }, 'Published — now the live workflow')
  const rollback = (id: string) => run(async () => { await publishWorkflowVersion(id); await load(id) }, 'Rolled back')
  const del = (id: string) => run(async () => { await deleteWorkflowDraft(id); await load() }, 'Draft deleted')
  const newDraft = () => run(async () => {
    const base = (versions?.find((x) => x.id === publishedId) ?? selected)?.stages ?? []
    const r = await createWorkflowDraft(base.length ? base.map((s) => ({ stageType: s.stageType as StageType, departmentId: s.departmentId, label: s.label })) : [{ stageType: 'design', departmentId: deptByCode('DESIGN'), label: 'Design' }], 'New draft')
    await load(r.version.id)
  }, 'New draft created')
  const cloneToDraft = () => selected && run(async () => {
    const r = await createWorkflowDraft(selected.stages.map((s) => ({ stageType: s.stageType as StageType, departmentId: s.departmentId, label: s.label })), `Clone of v${selected.version}`)
    await load(r.version.id)
  }, 'Cloned to a new draft')

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">Workflow Studio</h1>
        <span className="dw__sub">{selected ? `editing v${selected.version} · ${selected.status}${publishedId ? ` · live = v${versions?.find((x) => x.id === publishedId)?.version}` : ''}` : 'loading…'}</span>
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

          {/* editor / viewer */}
          <div className="wstu__canvas">
            {!selected ? <div className="dw__empty">Pick a version.</div> : isDraft ? (
              <>
                <div className="wstu__flow">
                  {edit!.map((s, i) => (
                    <div key={s.key} className="wstu__stagewrap">
                      <div className={`wstu__stage wfm__node--${s.stageType}`}>
                        <div className="wstu__stage-top">
                          <span className="wstu__seq">{i + 1}</span>
                          <div className="wstu__reorder">
                            <button disabled={i === 0} onClick={() => move(i, -1)} title="Move up">↑</button>
                            <button disabled={i === edit!.length - 1} onClick={() => move(i, 1)} title="Move down">↓</button>
                            <button className="wstu__del" onClick={() => removeStage(i)} title="Remove stage">×</button>
                          </div>
                        </div>
                        <input className="wstu__label" value={s.label} placeholder="Stage label" onChange={(e) => setStage(i, { label: e.target.value })} />
                        <select className="wstu__sel" value={s.stageType} onChange={(e) => onTypeChange(i, e.target.value as StageType)}>
                          {STAGE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <select className="wstu__sel" value={s.departmentId ?? ''} onChange={(e) => setStage(i, { departmentId: e.target.value || null })}>
                          <option value="">— no department —</option>
                          {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        {s.stageType === 'production' && <span className="wstu__hint">free-scan stations</span>}
                      </div>
                      {i < edit!.length - 1 && <span className="wstu__arrow">→</span>}
                    </div>
                  ))}
                  <button className="wstu__add" onClick={addStage}>＋ Add stage</button>
                </div>
                <div className="wstu__actions">
                  <button className="ord__btn ord__btn--ghost" disabled={busy || !isDraft} onClick={() => del(selId!)}>Delete draft</button>
                  <div style={{ flex: 1 }} />
                  <button className="ord__btn" disabled={busy || !dirty || !validEdit} onClick={saveDraft}>{dirty ? 'Save draft' : 'Saved'}</button>
                  <button className="ord__btn ord__btn--solid" disabled={busy || !validEdit} onClick={publish}>▲ Publish → live</button>
                </div>
                <p className="dwa__legend dw__lbl">Editing a draft is safe — nothing changes on the floor until you publish. Publishing archives the current live version; jobs already created keep their original route.</p>
              </>
            ) : (
              <>
                <div className="wstu__flow">
                  {selected.stages.map((s, i) => (
                    <div key={s.id} className="wstu__stagewrap">
                      <div className={`wstu__stage wstu__stage--ro wfm__node--${s.stageType}`}>
                        <span className="wstu__seq">{i + 1}</span>
                        <span className="wstu__rolabel">{s.label}</span>
                        <span className="wstu__rotype">{s.stageType.replace(/_/g, ' ')}</span>
                        {s.department && <span className="wstu__hint">⛭ {s.department.name}</span>}
                      </div>
                      {i < selected.stages.length - 1 && <span className="wstu__arrow">→</span>}
                    </div>
                  ))}
                </div>
                <div className="wstu__actions">
                  {selected.id !== publishedId && <button className="ord__btn ord__btn--solid" disabled={busy} onClick={() => rollback(selected.id)}>↺ Roll back to v{selected.version}</button>}
                  <div style={{ flex: 1 }} />
                  <button className="ord__btn" disabled={busy} onClick={cloneToDraft}>Clone to editable draft</button>
                </div>
                <p className="dwa__legend dw__lbl">{selected.id === publishedId ? 'This is the LIVE workflow. Clone it to a draft to make changes, then publish.' : 'An archived version. Roll back to make it live again, or clone it to edit.'}</p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
