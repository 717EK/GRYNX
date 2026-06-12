import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import {
  getPurchaseJobs, getMaterials, logMaterial,
  getMaterialRequests, getJobMaterialRequests, createMaterialRequest, updateMaterialRequest,
  type QueueJob, type MaterialLine, type MaterialRequest,
} from '../lib/api'
import ReportButton from '../components/ReportButton'
import './Maintenance.css'
import './DeptHome.css'

type PJob = QueueJob & { materialCount?: number }
type View = 'needs' | 'jobs'
const NEXT: Record<string, string | null> = { needed: 'ordered', ordered: 'received', received: null, cancelled: null }

export default function PurchaseHome({ user, onBack, onLock }: { user: SessionUser; onBack: () => void; onLock: () => void }) {
  const [view, setView] = useState<View>('needs')
  const [jobs, setJobs] = useState<PJob[] | null>(null)
  const [needs, setNeeds] = useState<MaterialRequest[] | null>(null)
  const [active, setActive] = useState<PJob | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function loadJobs() { try { setJobs((await getPurchaseJobs()).jobs) } catch { setJobs([]) } }
  async function loadNeeds() { try { setNeeds((await getMaterialRequests()).requests) } catch { setNeeds([]) } }
  useEffect(() => { void loadJobs(); void loadNeeds() }, [])

  async function advance(n: MaterialRequest) {
    const next = NEXT[n.status]
    if (!next) return
    setBusyId(n.id)
    try { await updateMaterialRequest(n.id, { status: next }); await loadNeeds() } catch { /* ignore */ } finally { setBusyId(null) }
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Purchase</h1>
            <span className="mono-label">{view === 'needs' ? (needs ? `${needs.length} open needs` : 'Loading…') : (jobs ? `${jobs.length} active jobs` : 'Loading…')}</span>
          </div>
          <ReportButton />
        </header>
        <div className="js__stages" style={{ padding: '0 16px' }}>
          <button className={`js__stage ${view === 'needs' ? 'is-on' : ''}`} onClick={() => setView('needs')}>Material Needs</button>
          <button className={`js__stage ${view === 'jobs' ? 'is-on' : ''}`} onClick={() => setView('jobs')}>Jobs · Raw Log</button>
        </div>
        <div className="screen__scroll">
          {view === 'needs' ? (
            needs === null ? <span className="dh__empty mono-label">Loading…</span>
            : needs.length === 0 ? <span className="dh__empty mono-label">No open material needs. Production is working with what's on hand.</span>
            : (
              <ul className="dh__list">
                {needs.map((n) => (
                  <li key={n.id}>
                    <div className="dh__row">
                      <span className="dh__main">
                        <span className="dh__label display">{n.item}{n.quantity ? ` · ${n.quantity}` : ''}</span>
                        <span className="dh__meta mono-label">{n.job?.name || n.job?.displayLabel} · {n.vendor || 'no vendor'}{n.note ? ` · ${n.note}` : ''}</span>
                      </span>
                      <span className="dh__right">
                        <span className={`jd__mtag jd__mtag--${n.status}`}>{n.status}</span>
                        {NEXT[n.status] && (
                          <button className="btn btn--solid" style={{ padding: '6px 10px', fontSize: 12 }} disabled={busyId === n.id} onClick={() => advance(n)}>
                            → {NEXT[n.status]}
                          </button>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            jobs === null ? <span className="dh__empty mono-label">Loading…</span>
            : jobs.length === 0 ? <span className="dh__empty mono-label">No active jobs.</span>
            : (
              <ul className="dh__list">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button className="dh__row" onClick={() => setActive(j)}>
                      <span className="dh__main">
                        <span className="dh__label display">{j.name || j.displayLabel}</span>
                        <span className="dh__meta mono-label">{j.product?.name} · {j.totalQty} units</span>
                      </span>
                      <span className="dh__right">
                        <span className={`dh__tag mono-label ${j.materialCount ? 'dh__tag--ok' : 'dh__tag--info'}`}>{j.materialCount ? `${j.materialCount} logged` : 'no raw'}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </main>
      <BottomBar />
      {active && <MaterialModal job={active} onClose={() => setActive(null)} onDone={() => { void loadJobs(); void loadNeeds() }} />}
    </div>
  )
}

function MaterialModal({ job, onClose, onDone }: { job: PJob; onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<'need' | 'usage'>('need')
  const [materials, setMaterials] = useState<MaterialLine[]>([])
  const [needs, setNeeds] = useState<MaterialRequest[]>([])
  // raise-need
  const [nItem, setNItem] = useState('')
  const [nQty, setNQty] = useState('')
  const [nNote, setNNote] = useState('')
  // usage log
  const [item, setItem] = useState('')
  const [materialType, setType] = useState('')
  const [vendor, setVendor] = useState('')
  const [batchRef, setBatch] = useState('')
  const [quantity, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function reload() {
    try { setMaterials((await getMaterials(job.id)).materials) } catch { /* ignore */ }
    try { setNeeds((await getJobMaterialRequests(job.id)).requests) } catch { /* ignore */ }
  }
  useEffect(() => { void reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function raiseNeed() {
    if (!nItem.trim()) { setErr('Item required'); return }
    setBusy(true); setErr(null)
    try { await createMaterialRequest(job.id, { item: nItem.trim(), quantity: nQty.trim() || undefined, note: nNote.trim() || undefined }); setNItem(''); setNQty(''); setNNote(''); await reload(); onDone() }
    catch { setErr('Could not raise need') } finally { setBusy(false) }
  }
  async function add() {
    if (!item.trim()) { setErr('Item name required'); return }
    setBusy(true); setErr(null)
    try {
      await logMaterial(job.id, { item: item.trim(), materialType: materialType.trim() || undefined, vendor: vendor.trim() || undefined, batchRef: batchRef.trim() || undefined, quantity: quantity.trim() || undefined })
      setItem(''); setType(''); setVendor(''); setBatch(''); setQty(''); await reload(); onDone()
    } catch { setErr('Could not log material') } finally { setBusy(false) }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">{job.name || job.displayLabel}</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="js__stages">
          <button className={`js__stage ${tab === 'need' ? 'is-on' : ''}`} onClick={() => setTab('need')}>Raise need</button>
          <button className={`js__stage ${tab === 'usage' ? 'is-on' : ''}`} onClick={() => setTab('usage')}>Raw used</button>
        </div>

        {tab === 'need' ? (
          <>
            {needs.length > 0 && (
              <div className="dh__serials" style={{ flexDirection: 'column', gap: 6 }}>
                {needs.map((n) => <div key={n.id} className="dh__matline"><b>{n.item}{n.quantity ? ` · ${n.quantity}` : ''} <span className={`jd__mtag jd__mtag--${n.status}`}>{n.status}</span></b></div>)}
              </div>
            )}
            <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 4 }}>Flag a shortage (production keeps working meanwhile)</span>
            <input className="mnt__input" placeholder="Item needed (e.g. M12 connectors)" value={nItem} onChange={(e) => setNItem(e.target.value)} />
            <div className="mnt__row2">
              <input className="mnt__input" placeholder="Qty (40 pcs)" value={nQty} onChange={(e) => setNQty(e.target.value)} />
              <input className="mnt__input" placeholder="Note" value={nNote} onChange={(e) => setNNote(e.target.value)} />
            </div>
            {err && <span className="mnt__err mono-label">{err}</span>}
            <button className="btn btn--solid btn--block" disabled={busy} onClick={raiseNeed}>{busy ? '…' : '⚑ Raise material need'}</button>
          </>
        ) : (
          <>
            {materials.length > 0 && (
              <div className="dh__serials" style={{ flexDirection: 'column', gap: 6 }}>
                {materials.map((m) => (
                  <div key={m.id} className="dh__matline">
                    <b>{m.item}{m.quantity ? ` · ${m.quantity}` : ''}</b>
                    <span>{[m.materialType, m.vendor && `vendor: ${m.vendor}`, m.batchRef && `batch: ${m.batchRef}`].filter(Boolean).join(' · ') || '—'}</span>
                  </div>
                ))}
              </div>
            )}
            <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 4 }}>Log raw material used (genealogy)</span>
            <input className="mnt__input" placeholder="Item (e.g. AL tube 50mm)" value={item} onChange={(e) => setItem(e.target.value)} />
            <div className="mnt__row2">
              <input className="mnt__input" placeholder="Type" value={materialType} onChange={(e) => setType(e.target.value)} />
              <input className="mnt__input" placeholder="Qty (120 kg)" value={quantity} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="mnt__row2">
              <input className="mnt__input" placeholder="Vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              <input className="mnt__input" placeholder="Batch ref" value={batchRef} onChange={(e) => setBatch(e.target.value)} />
            </div>
            {err && <span className="mnt__err mono-label">{err}</span>}
            <button className="btn btn--solid btn--block" disabled={busy} onClick={add}>{busy ? '…' : '+ Log material'}</button>
          </>
        )}
      </div>
    </div>
  )
}
