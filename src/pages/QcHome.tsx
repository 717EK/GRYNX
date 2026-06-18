import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getQcQueue, qcApprove, qcRework, qcReceive, getReworkTargets, getQcProduction, markVisitQc, type QueueJob, type Station, type QcProductionJob, type StationVisit } from '../lib/api'
import ReportButton from '../components/ReportButton'
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
  const [recv, setRecv] = useState<string | null>(null)
  const [floor, setFloor] = useState<QcProductionJob[] | null>(null)
  const [floorActive, setFloorActive] = useState<QcProductionJob | null>(null)

  async function load() {
    try {
      const { jobs } = await getQcQueue()
      setJobs(jobs)
    } catch {
      setJobs([])
    }
    getQcProduction().then((r) => setFloor(r.jobs)).catch(() => setFloor([]))
  }
  useEffect(() => {
    void load()
  }, [])

  async function receive(j: QueueJob) {
    setRecv(j.id)
    try { await qcReceive(j.id); await load() } catch { /* ignore */ } finally { setRecv(null) }
  }

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
          <ReportButton />
        </header>
        <div className="screen__scroll">
          {/* per-station QC (phase 4): jobs on the floor — mark each station checked / flag issues */}
          {(floor?.length ?? 0) > 0 && (
            <section className="jsec">
              <h2 className="jsec__title mono-label">On the floor · per-station QC <span className="jsec__count">{floor!.length}</span></h2>
              <ul className="dh__list">
                {floor!.map((j) => {
                  const open = j.stationVisits.filter((v) => v.qcIssue && !v.qcResolvedAt).length
                  const unchecked = j.stationVisits.filter((v) => !v.qcChecked && !v.qcIssue).length
                  return (
                    <li key={j.id}>
                      <button className="dh__row" onClick={() => setFloorActive(j)}>
                        <span className="dh__main">
                          <span className="dh__label display">{j.name || j.displayLabel}</span>
                          <span className="dh__meta mono-label">{j.product?.name} · {j.stationVisits.length} station scan{j.stationVisits.length === 1 ? '' : 's'}</span>
                        </span>
                        <span className="dh__right">
                          {open > 0 && <span className="dh__tag dh__tag--urgent mono-label">{open} ISSUE</span>}
                          {open === 0 && unchecked > 0 && <span className="dh__tag dh__tag--info mono-label">{unchecked} TO CHECK</span>}
                          {open === 0 && unchecked === 0 && <span className="dh__tag mono-label" style={{ color: 'var(--brand)' }}>✓ ALL CHECKED</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          {jobs === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : jobs.length === 0 ? (
            (floor?.length ?? 0) === 0 ? <span className="dh__empty mono-label">Nothing to inspect right now.</span> : null
          ) : (
            <ul className="dh__list">
              {jobs.map((j) => (
                <li key={j.id}>
                  {j.atProduction ? (
                    <div className="dh__row">
                      <span className="dh__main">
                        <span className="dh__label display">{j.name || j.displayLabel}</span>
                        <span className="dh__meta mono-label">{j.product?.name} · {j.totalQty} units · in production</span>
                      </span>
                      <span className="dh__right">
                        {j.priority === 'urgent' && <span className="dh__tag dh__tag--urgent mono-label">URGENT</span>}
                        <button className="btn btn--solid" style={{ padding: '6px 12px', fontSize: 12 }} disabled={recv === j.id} onClick={() => receive(j)}>
                          {recv === j.id ? '…' : '↓ Receive'}
                        </button>
                      </span>
                    </div>
                  ) : (
                    <button className="dh__row" onClick={() => setActive(j)}>
                      <span className="dh__main">
                        <span className="dh__label display">{j.name || j.displayLabel}</span>
                        <span className="dh__meta mono-label">{j.product?.name} · {j.totalQty} units</span>
                      </span>
                      <span className="dh__right">
                        {j.priority === 'urgent' && <span className="dh__tag dh__tag--urgent mono-label">URGENT</span>}
                        <span className="dh__tag dh__tag--info mono-label">AT QC</span>
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
      {active && <QcModal job={active} onClose={() => setActive(null)} onDone={() => { setActive(null); void load() }} />}
      {floorActive && <QcFloorModal job={floorActive} onClose={() => setFloorActive(null)} onDone={() => { setFloorActive(null); void load() }} />}
    </div>
  )
}

function QcModal({ job, onClose, onDone }: { job: QueueJob; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'choose' | 'rework'>('choose')
  const [stations, setStations] = useState<Station[]>([])
  const [reworkTo, setReworkTo] = useState('') // '' = back to Production (head decides)

  useEffect(() => {
    getReworkTargets(job.id).then((r) => setStations(r.stations)).catch(() => {})
  }, [job.id])

  async function approve() {
    setErr(null); setBusy(true)
    try { await qcApprove(job.id, notes.trim() || undefined); onDone() }
    catch { setErr('Action failed — try again'); setBusy(false) }
  }
  async function sendRework() {
    setErr(null)
    if (!notes.trim()) { setErr('Add a note on what failed'); return }
    setBusy(true)
    try { await qcRework(job.id, notes.trim(), reworkTo ? { reworkStationId: reworkTo } : undefined); onDone() }
    catch { setErr('Action failed — try again'); setBusy(false) }
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
          <span className="mono-label">{mode === 'rework' ? 'What failed? (sent to the floor)' : 'Notes'}</span>
          <textarea className="mnt__textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Inspection notes / defect details" />
        </label>

        {mode === 'rework' && (
          <label className="mnt__field">
            <span className="mono-label">Send back to</span>
            <select className="mnt__select" value={reworkTo} onChange={(e) => setReworkTo(e.target.value)}>
              <option value="">Production — head decides</option>
              {stations.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}

        {err && <span className="mnt__err mono-label">{err}</span>}

        {mode === 'choose' ? (
          <div className="dh__modal-actions">
            <button className="btn btn--danger" disabled={busy} onClick={() => setMode('rework')}>↩ Send Rework</button>
            <button className="btn btn--solid" disabled={busy} onClick={approve}>{busy ? '…' : '✓ Approve → FG'}</button>
          </div>
        ) : (
          <div className="dh__modal-actions">
            <button className="btn btn--ghost" disabled={busy} onClick={() => { setMode('choose'); setErr(null) }}>← Back</button>
            <button className="btn btn--danger" disabled={busy} onClick={sendRework}>{busy ? '…' : '↩ Confirm rework'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// per-station QC marking (phase 4): mark each station visit checked / flag an
// issue (with note) / resolve. Non-blocking for movement; an open issue blocks FG.
function QcFloorModal({ job, onClose, onDone }: { job: QcProductionJob; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [issueFor, setIssueFor] = useState<string | null>(null)
  const [note, setNote] = useState('')

  async function mark(v: StationVisit, input: { checked?: boolean; issue?: boolean; note?: string; resolve?: boolean }) {
    setBusy(v.id)
    try { await markVisitQc(v.id, input); onDone() } catch { setBusy(null) }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">{job.name || job.displayLabel}</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{job.product?.name} · per-station QC</span>
        <div className="qcf__list">
          {job.stationVisits.length === 0 && <span className="dh__empty mono-label">No station scans yet.</span>}
          {job.stationVisits.map((v) => {
            const openIssue = v.qcIssue && !v.qcResolvedAt
            return (
              <div key={v.id} className={`qcf__row ${openIssue ? 'qcf__row--issue' : ''}`}>
                <div className="qcf__rowtop">
                  <b>{v.station.name}</b>
                  {openIssue ? <span className="qcf__tag qcf__tag--issue">⚠ issue</span>
                    : v.qcIssue ? <span className="qcf__tag qcf__tag--ok">resolved</span>
                    : v.qcChecked ? <span className="qcf__tag qcf__tag--ok">✓ checked</span>
                    : <span className="qcf__tag qcf__tag--mut">unchecked</span>}
                </div>
                {v.remark && <span className="qcf__remark">“{v.remark}”</span>}
                {openIssue && v.qcNote && <span className="qcf__remark qcf__remark--issue">⚠ {v.qcNote}</span>}
                {issueFor === v.id ? (
                  <div className="qcf__issueform">
                    <input className="mnt__input" placeholder="What's the issue?" value={note} autoFocus onChange={(e) => setNote(e.target.value)} />
                    <button className="btn btn--danger" disabled={busy === v.id || !note.trim()} onClick={() => mark(v, { issue: true, note: note.trim() })}>{busy === v.id ? '…' : 'Flag'}</button>
                    <button className="btn btn--ghost" onClick={() => { setIssueFor(null); setNote('') }}>×</button>
                  </div>
                ) : (
                  <div className="qcf__actions">
                    {openIssue ? (
                      <button className="btn btn--solid" disabled={busy === v.id} onClick={() => mark(v, { resolve: true })}>{busy === v.id ? '…' : '✓ Resolve'}</button>
                    ) : (
                      <>
                        <button className="btn btn--solid" disabled={busy === v.id} onClick={() => mark(v, { checked: true })}>{busy === v.id ? '…' : '✓ Checked'}</button>
                        <button className="btn btn--ghost" onClick={() => { setIssueFor(v.id); setNote('') }}>⚠ Issue</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <span className="mono-label qcf__hint">ⓘ Marking is a record — it doesn't stop the job moving. An open issue blocks FG from closing the job until resolved.</span>
      </div>
    </div>
  )
}
