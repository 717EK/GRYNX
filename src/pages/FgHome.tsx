import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getFgQueue, getSerials, addSerials, requestClosure, type FgJob } from '../lib/api'
import './Maintenance.css'
import './DeptHome.css'

export default function FgHome({ user, onBack, onLock }: { user: SessionUser; onBack: () => void; onLock: () => void }) {
  const [jobs, setJobs] = useState<FgJob[] | null>(null)
  const [active, setActive] = useState<FgJob | null>(null)

  async function load() {
    try {
      const { jobs } = await getFgQueue()
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
            <h1 className="screen__title display">FG Stock</h1>
            <span className="mono-label">{jobs ? `${jobs.length} to receive / serialise` : 'Loading…'}</span>
          </div>
          <span />
        </header>
        <div className="screen__scroll">
          {jobs === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : jobs.length === 0 ? (
            <span className="dh__empty mono-label">No jobs at FG Stock right now.</span>
          ) : (
            <ul className="dh__list">
              {jobs.map((j) => (
                <li key={j.id}>
                  <button className="dh__row" onClick={() => setActive(j)}>
                    <span className="dh__main">
                      <span className="dh__label display">{j.displayLabel}</span>
                      <span className="dh__meta mono-label">{j.product?.name} · {j.totalQty} units · {j.serialCount ?? 0} serials</span>
                    </span>
                    <span className="dh__right">
                      {j.priority === 'urgent' && <span className="dh__tag dh__tag--urgent mono-label">URGENT</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
      {active && <FgModal job={active} onClose={() => setActive(null)} onDone={() => { setActive(null); void load() }} />}
    </div>
  )
}

function FgModal({ job, onClose, onDone }: { job: FgJob; onClose: () => void; onDone: () => void }) {
  const [serials, setSerials] = useState<{ id: string; serialNo: string }[]>([])
  const [text, setText] = useState('')
  const [received, setReceived] = useState(String(job.totalQty))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function loadSerials() {
    try {
      const { serials } = await getSerials(job.id)
      setSerials(serials)
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    void loadSerials()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addBatch() {
    const list = text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    if (!list.length) return
    setBusy(true)
    setErr(null)
    try {
      await addSerials(job.id, list)
      setText('')
      await loadSerials()
    } catch {
      setErr('Could not add serials')
    } finally {
      setBusy(false)
    }
  }

  async function close() {
    setBusy(true)
    setErr(null)
    try {
      await requestClosure(job.id, Math.max(0, Number(received) || 0))
      onDone()
    } catch {
      setErr('Could not request closure')
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
        <label className="mnt__field">
          <span className="mono-label">Serial numbers ({serials.length} saved) — paste, one per line</span>
          <textarea className="mnt__textarea" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`AT-LD38-0001\nAT-LD38-0002`} />
        </label>
        <button className="btn btn--ghost btn--block" disabled={busy || !text.trim()} onClick={addBatch}>+ Add serials</button>
        {serials.length > 0 && (
          <div className="dh__serials">
            {serials.map((s) => <span key={s.id} className="dh__serial">{s.serialNo}</span>)}
          </div>
        )}
        <label className="mnt__field">
          <span className="mono-label">Received quantity</span>
          <input className="mnt__input" type="number" min={0} value={received} onChange={(e) => setReceived(e.target.value)} />
        </label>
        {err && <span className="mnt__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={close}>{busy ? '…' : 'Request Closure'}</button>
      </div>
    </div>
  )
}
