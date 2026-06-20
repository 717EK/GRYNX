import { useEffect, useMemo, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import {
  getQcQueue, qcApprove, qcRework, qcReceive, getReworkTargets,
  getQcStations, getQcReportableJobs, raiseQcReport, getQcReports, resolveQcReport, dismissQcReport,
  type QueueJob, type Station, type QcReport, type QcReportableJob, type QcKind, type QcSeverity,
} from '../lib/api'
import ReportButton from '../components/ReportButton'
import './Maintenance.css'
import './DeptHome.css'
import './QcDesk.css'

const STATION_KEY = 'grynx.qc.station'

// QC as a PARALLEL department (docs/12). The inspector picks the station they're
// standing at; every report they raise auto-tags to it. Hero = raise a report.
// Below = the live feed of reports at that station + their status.
export default function QcHome({ user, onBack, onLock }: { user: SessionUser; onBack: () => void; onLock: () => void }) {
  const [stations, setStations] = useState<Station[]>([])
  const [stationId, setStationId] = useState<string>(() => localStorage.getItem(STATION_KEY) ?? '')
  const [reports, setReports] = useState<QcReport[] | null>(null)
  const [scope, setScope] = useState<'station' | 'all'>('station')
  const [raising, setRaising] = useState(false)
  const [gate, setGate] = useState<QueueJob[]>([])
  const [gateActive, setGateActive] = useState<QueueJob | null>(null)
  const [recv, setRecv] = useState<string | null>(null)

  const station = useMemo(() => stations.find((s) => s.id === stationId) ?? null, [stations, stationId])

  function pickStation(id: string) { setStationId(id); if (id) localStorage.setItem(STATION_KEY, id); else localStorage.removeItem(STATION_KEY) }

  async function loadReports() {
    try { setReports((await getQcReports(scope === 'all' ? { scope: 'all' } : stationId ? { stationId } : { scope: 'all' })).reports) }
    catch { setReports([]) }
  }
  useEffect(() => { getQcStations().then((r) => setStations(r.stations)).catch(() => {}) }, [])
  useEffect(() => { void loadReports() /* eslint-disable-next-line */ }, [stationId, scope])
  // legacy in-flight jobs still sitting at the QC gate (created before the cutover)
  useEffect(() => { getQcQueue().then((r) => setGate(r.jobs)).catch(() => setGate([])) }, [])

  async function receive(j: QueueJob) {
    setRecv(j.id)
    try { await qcReceive(j.id); setGate((g) => g.filter((x) => x.id !== j.id)) } catch { /* ignore */ } finally { setRecv(null) }
  }

  const open = (reports ?? []).filter((r) => r.status === 'open')
  const done = (reports ?? []).filter((r) => r.status !== 'open')

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">QC Desk</h1>
            <span className="mono-label">{station ? `at ${station.name}` : 'pick your station'}</span>
          </div>
          <ReportButton />
        </header>
        <div className="screen__scroll">
          {/* station selector — the inspector says where they are standing */}
          <label className="qcd__station">
            <span className="mono-label">I'm at station</span>
            <select className="mnt__select" value={stationId} onChange={(e) => pickStation(e.target.value)}>
              <option value="">— select your station —</option>
              {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>

          {/* HERO — raise a report (auto-tagged to the chosen station) */}
          <button className="qcd__hero" onClick={() => setRaising(true)}>
            <span className="qcd__hero-ico">⚑</span>
            <span className="qcd__hero-main">
              <b>Raise QC Report</b>
              <span className="mono-label">{station ? `→ auto-tagged to ${station.name}` : 'issue · suggestion · note — on any job'}</span>
            </span>
            <span className="qcd__hero-plus">＋</span>
          </button>

          {/* the station's report feed */}
          <section className="jsec">
            <h2 className="jsec__title mono-label">
              Reports {scope === 'all' ? '· all stations' : station ? `· ${station.name}` : '· all'}
              <button className="qcd__scope" onClick={() => setScope((s) => (s === 'all' ? 'station' : 'all'))}>{scope === 'all' ? 'show mine' : 'show all'}</button>
            </h2>
            {reports === null ? <span className="dh__empty mono-label">Loading…</span>
              : reports.length === 0 ? <span className="dh__empty mono-label">No reports here yet. Raise one above.</span>
              : (
                <div className="qcd__feed">
                  {open.map((r) => <ReportCard key={r.id} r={r} onChange={loadReports} />)}
                  {done.length > 0 && <div className="qcd__divider mono-label">Resolved / dismissed</div>}
                  {done.map((r) => <ReportCard key={r.id} r={r} onChange={loadReports} />)}
                </div>
              )}
          </section>

          {/* legacy gate queue — only while pre-cutover jobs still need a QC pass */}
          {gate.length > 0 && (
            <section className="jsec">
              <h2 className="jsec__title mono-label">At the QC gate · legacy <span className="jsec__count">{gate.length}</span></h2>
              <ul className="dh__list">
                {gate.map((j) => (
                  <li key={j.id}>
                    {j.atProduction ? (
                      <div className="dh__row">
                        <span className="dh__main"><span className="dh__label display">{j.name || j.displayLabel}</span><span className="dh__meta mono-label">{j.product?.name} · in production</span></span>
                        <span className="dh__right"><button className="btn btn--solid" style={{ padding: '6px 12px', fontSize: 12 }} disabled={recv === j.id} onClick={() => receive(j)}>{recv === j.id ? '…' : '↓ Receive'}</button></span>
                      </div>
                    ) : (
                      <button className="dh__row" onClick={() => setGateActive(j)}>
                        <span className="dh__main"><span className="dh__label display">{j.name || j.displayLabel}</span><span className="dh__meta mono-label">{j.product?.name} · {j.totalQty} units</span></span>
                        <span className="dh__right"><span className="dh__tag dh__tag--info mono-label">AT QC</span></span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <BottomBar />
      {raising && <RaiseModal stationId={stationId} stationName={station?.name ?? null} onClose={() => setRaising(false)} onDone={() => { setRaising(false); void loadReports() }} />}
      {gateActive && <GateModal job={gateActive} onClose={() => setGateActive(null)} onDone={() => { setGateActive(null); getQcQueue().then((r) => setGate(r.jobs)).catch(() => {}) }} />}
    </div>
  )
}

const KIND_META: Record<QcKind, { icon: string; label: string }> = {
  issue: { icon: '⚠', label: 'Issue' }, suggestion: { icon: '💡', label: 'Suggestion' }, note: { icon: '📝', label: 'Note' },
}

function ReportCard({ r, onChange }: { r: QcReport; onChange: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const k = KIND_META[r.kind]
  const held = r.holdApproved
  const holdPending = r.holdRequested && !r.holdApproved && r.status === 'open'
  async function act(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); await onChange() } catch { setBusy(false) } }
  return (
    <div className={`qcd__card ${held ? 'qcd__card--held' : r.kind === 'issue' && r.status === 'open' ? 'qcd__card--issue' : ''} ${r.status !== 'open' ? 'qcd__card--done' : ''}`}>
      <div className="qcd__card-top">
        <span className="qcd__kind">{k.icon} {k.label}{r.severity ? ` · ${r.severity}` : ''}</span>
        {held ? <span className="qcd__badge qcd__badge--held">⛔ HARD HOLD</span>
          : holdPending ? <span className="qcd__badge qcd__badge--pend">hold · awaiting admin</span>
          : r.status === 'resolved' ? <span className="qcd__badge qcd__badge--ok">✓ resolved</span>
          : r.status === 'dismissed' ? <span className="qcd__badge qcd__badge--mut">dismissed</span>
          : <span className="qcd__badge qcd__badge--open">open</span>}
      </div>
      <div className="qcd__job display">{r.job.displayLabel}</div>
      <div className="qcd__meta mono-label">{r.job.product?.name}{r.station ? ` · ${r.station.name}` : ''} · {r.raisedByName} · {new Date(r.raisedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      <div className="qcd__note">{r.note}</div>
      {r.photoUrl && <img className="qcd__photo" src={r.photoUrl} alt="defect" />}
      {r.resolutionNote && <div className="qcd__res mono-label">✓ {r.resolvedByName}: {r.resolutionNote}</div>}
      {r.status === 'open' && (
        <div className="qcd__card-actions">
          <button className="btn btn--solid" disabled={busy} onClick={() => act(() => resolveQcReport(r.id, 'fixed'))}>{busy ? '…' : '✓ Resolve'}</button>
          {r.kind !== 'issue' && <button className="btn btn--ghost" disabled={busy} onClick={() => act(() => dismissQcReport(r.id))}>Dismiss</button>}
        </div>
      )}
    </div>
  )
}

function RaiseModal({ stationId, stationName, onClose, onDone }: { stationId: string; stationName: string | null; onClose: () => void; onDone: () => void }) {
  const [jobs, setJobs] = useState<QcReportableJob[]>([])
  const [q, setQ] = useState('')
  const [jobId, setJobId] = useState('')
  const [kind, setKind] = useState<QcKind>('issue')
  const [severity, setSeverity] = useState<QcSeverity>('minor')
  const [note, setNote] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [hold, setHold] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { getQcReportableJobs().then((r) => setJobs(r.jobs)).catch(() => {}) }, [])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? jobs.filter((j) => j.displayLabel.toLowerCase().includes(t) || j.product?.name?.toLowerCase().includes(t)) : jobs
  }, [jobs, q])
  const job = jobs.find((j) => j.id === jobId)

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 4_000_000) { setErr('Photo too large (max ~4MB)'); return }
    const fr = new FileReader(); fr.onload = () => setPhotoUrl(fr.result as string); fr.readAsDataURL(f)
  }
  async function submit() {
    setErr(null)
    if (!jobId) { setErr('Pick the job this is about'); return }
    if (!note.trim()) { setErr('Describe what you saw'); return }
    setBusy(true)
    try {
      await raiseQcReport({ jobId, stationId: stationId || undefined, kind, severity: kind === 'issue' ? severity : undefined, note: note.trim(), photoUrl, holdRequested: kind === 'issue' ? hold : undefined })
      onDone()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not raise report'); setBusy(false) }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">Raise QC Report</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{stationName ? `auto-tagged → ${stationName}` : 'no station selected — pick one on the desk to auto-tag'}</span>

        {/* job picker */}
        <label className="mnt__field">
          <span className="mono-label">Job</span>
          {job ? (
            <div className="qcd__picked"><b className="display">{job.displayLabel}</b><span className="mono-label">{job.product?.name}</span><button className="qcd__change" onClick={() => setJobId('')}>change</button></div>
          ) : (
            <>
              <input className="mnt__input" placeholder="Search job / product…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="qcd__joblist">
                {filtered.slice(0, 8).map((j) => (
                  <button key={j.id} className="qcd__jobopt" onClick={() => setJobId(j.id)}>
                    <span className="display">{j.displayLabel}</span>
                    <span className="mono-label">{j.product?.name}{j.openReports > 0 ? ` · ${j.openReports} open` : ''}</span>
                  </button>
                ))}
                {filtered.length === 0 && <span className="dh__empty mono-label">No active jobs match.</span>}
              </div>
            </>
          )}
        </label>

        {/* kind */}
        <div className="qcd__kinds">
          {(['issue', 'suggestion', 'note'] as QcKind[]).map((kk) => (
            <button key={kk} className={`qcd__kindbtn ${kind === kk ? 'is-on' : ''}`} onClick={() => setKind(kk)}>{KIND_META[kk].icon} {KIND_META[kk].label}</button>
          ))}
        </div>

        {kind === 'issue' && (
          <div className="qcd__sev">
            {(['minor', 'major', 'critical'] as QcSeverity[]).map((s) => (
              <button key={s} className={`qcd__sevbtn ${severity === s ? 'is-on' : ''} qcd__sevbtn--${s}`} onClick={() => setSeverity(s)}>{s}</button>
            ))}
          </div>
        )}

        <label className="mnt__field">
          <span className="mono-label">{kind === 'suggestion' ? 'How to make it better' : kind === 'note' ? 'Observation' : "What's the issue?"}</span>
          <textarea className="mnt__textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'issue' ? 'Defect / what went wrong…' : kind === 'suggestion' ? 'Improvement idea…' : 'Note…'} />
        </label>

        <label className="qcd__photo-in mono-label">
          {photoUrl ? '✓ photo attached — replace' : '📷 attach photo (optional)'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        </label>

        {kind === 'issue' && (
          <label className="qcd__hold">
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
            <span><b>Request a hard hold</b><span className="mono-label"> — blocks FG/dispatch; needs admin approval. Use for serious defects only.</span></span>
          </label>
        )}

        {err && <span className="mnt__err mono-label">{err}</span>}
        <div className="dh__modal-actions">
          <button className="btn btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn--solid" disabled={busy} onClick={submit}>{busy ? '…' : hold && kind === 'issue' ? '⚠ Raise + request hold' : 'Raise report'}</button>
        </div>
      </div>
    </div>
  )
}

// legacy gate pass/rework for in-flight jobs created before the cutover
function GateModal({ job, onClose, onDone }: { job: QueueJob; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<'choose' | 'rework'>('choose')
  const [stations, setStations] = useState<Station[]>([])
  const [reworkTo, setReworkTo] = useState('')
  useEffect(() => { getReworkTargets(job.id).then((r) => setStations(r.stations)).catch(() => {}) }, [job.id])
  async function approve() { setErr(null); setBusy(true); try { await qcApprove(job.id, notes.trim() || undefined); onDone() } catch { setErr('Action failed'); setBusy(false) } }
  async function sendRework() { setErr(null); if (!notes.trim()) { setErr('Add a note on what failed'); return } setBusy(true); try { await qcRework(job.id, notes.trim(), reworkTo ? { reworkStationId: reworkTo } : undefined); onDone() } catch { setErr('Action failed'); setBusy(false) } }
  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head"><span className="display mnt__modal-title">{job.displayLabel}</span><button className="modal__x" onClick={onClose} aria-label="Close">×</button></div>
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{job.product?.name} · {job.totalQty} units · legacy QC gate</span>
        <label className="mnt__field"><span className="mono-label">{mode === 'rework' ? 'What failed? (sent to the floor)' : 'Notes'}</span><textarea className="mnt__textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Inspection notes / defect details" /></label>
        {mode === 'rework' && (
          <label className="mnt__field"><span className="mono-label">Send back to</span><select className="mnt__select" value={reworkTo} onChange={(e) => setReworkTo(e.target.value)}><option value="">Production — head decides</option>{stations.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        )}
        {err && <span className="mnt__err mono-label">{err}</span>}
        {mode === 'choose' ? (
          <div className="dh__modal-actions"><button className="btn btn--danger" disabled={busy} onClick={() => setMode('rework')}>↩ Send Rework</button><button className="btn btn--solid" disabled={busy} onClick={approve}>{busy ? '…' : '✓ Approve → FG'}</button></div>
        ) : (
          <div className="dh__modal-actions"><button className="btn btn--ghost" disabled={busy} onClick={() => { setMode('choose'); setErr(null) }}>← Back</button><button className="btn btn--danger" disabled={busy} onClick={sendRework}>{busy ? '…' : '↩ Confirm rework'}</button></div>
        )}
      </div>
    </div>
  )
}
