import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getPurchaseJobs, getMaterials, logMaterial, type QueueJob, type MaterialLine } from '../lib/api'
import './Maintenance.css'
import './DeptHome.css'

type PJob = QueueJob & { materialCount?: number }

export default function PurchaseHome({ user, onBack, onLock }: { user: SessionUser; onBack: () => void; onLock: () => void }) {
  const [jobs, setJobs] = useState<PJob[] | null>(null)
  const [active, setActive] = useState<PJob | null>(null)

  async function load() {
    try {
      const { jobs } = await getPurchaseJobs()
      setJobs(jobs)
    } catch {
      setJobs([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Purchase</h1>
            <span className="mono-label">{jobs ? `${jobs.length} active jobs` : 'Loading…'}</span>
          </div>
          <span />
        </header>
        <div className="screen__scroll">
          {jobs === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : jobs.length === 0 ? (
            <span className="dh__empty mono-label">No active jobs.</span>
          ) : (
            <ul className="dh__list">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button className="dh__row" onClick={() => setActive(j)}>
                    <span className="dh__main">
                      <span className="dh__label display">{j.displayLabel}</span>
                      <span className="dh__meta mono-label">{j.product?.name} · {j.totalQty} units</span>
                    </span>
                    <span className="dh__right">
                      <span className={`dh__tag mono-label ${j.materialCount ? 'dh__tag--ok' : 'dh__tag--info'}`}>
                        {j.materialCount ? `${j.materialCount} logged` : 'no raw'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
      {active && <MaterialModal job={active} onClose={() => setActive(null)} onDone={() => { void load() }} />}
    </div>
  )
}

function MaterialModal({ job, onClose, onDone }: { job: PJob; onClose: () => void; onDone: () => void }) {
  const [materials, setMaterials] = useState<MaterialLine[]>([])
  const [item, setItem] = useState('')
  const [materialType, setType] = useState('')
  const [vendor, setVendor] = useState('')
  const [batchRef, setBatch] = useState('')
  const [quantity, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadMat() {
    try {
      const { materials } = await getMaterials(job.id)
      setMaterials(materials)
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void loadMat()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    if (!item.trim()) {
      setErr('Item name required')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await logMaterial(job.id, {
        item: item.trim(),
        materialType: materialType.trim() || undefined,
        vendor: vendor.trim() || undefined,
        batchRef: batchRef.trim() || undefined,
        quantity: quantity.trim() || undefined,
      })
      setItem('')
      setType('')
      setVendor('')
      setBatch('')
      setQty('')
      await loadMat()
      onDone()
    } catch {
      setErr('Could not log material')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">{job.displayLabel}</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
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
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 4 }}>Log raw material</span>
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
      </div>
    </div>
  )
}
