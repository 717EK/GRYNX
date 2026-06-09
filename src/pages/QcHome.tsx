import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getQcQueue, qcApprove, qcRework, type QueueJob } from '../lib/api'
import './Maintenance.css'
import './DeptHome.css'

export default function QcHome({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  const [jobs, setJobs] = useState<QueueJob[] | null>(null)
  const [active, setActive] = useState<QueueJob | null>(null)

  async function load() {
    try {
      const { jobs } = await getQcQueue()
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
            <h1 className="screen__title display">QC Inspection</h1>
            <span className="mono-label">{jobs ? `${jobs.length} awaiting inspection` : 'Loading…'}</span>
          </div>
          <span />
        </header>
        <div className="screen__scroll">
          {jobs === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : jobs.length === 0 ? (
            <span className="dh__empty mono-label">Nothing to inspect right now.</span>
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
                      {j.priority === 'urgent' && <span className="dh__tag dh__tag--urgent mono-label">URGENT</span>}
                      <span className="dh__tag dh__tag--info mono-label">{j.stepStatus === 'in_progress' ? 'HERE' : 'ARRIVING'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
      {active && <QcModal job={active} onClose={() => setActive(null)} onDone={() => { setActive(null); void load() }} />}
    </div>
  )
}

function QcModal({ job, onClose, onDone }: { job: QueueJob; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function act(approve: boolean) {
    setErr(null)
    if (!approve && !notes.trim()) {
      setErr('Rework needs a note on what failed')
      return
    }
    setBusy(true)
    try {
      if (approve) await qcApprove(job.id, notes.trim() || undefined)
      else await qcRework(job.id, notes.trim())
      onDone()
    } catch {
      setErr('Action failed — try again')
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
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{job.product?.name} · {job.totalQty} units</span>
        <label className="mnt__field">
          <span className="mono-label">Notes (required for rework)</span>
          <textarea className="mnt__textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Inspection notes / defect details" />
        </label>
        {err && <span className="mnt__err mono-label">{err}</span>}
        <div className="dh__modal-actions">
          <button className="btn btn--danger" disabled={busy} onClick={() => act(false)}>↩ Send Rework</button>
          <button className="btn btn--solid" disabled={busy} onClick={() => act(true)}>{busy ? '…' : '✓ Approve → FG'}</button>
        </div>
      </div>
    </div>
  )
}
