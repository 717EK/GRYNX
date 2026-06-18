import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobCardModal from '../components/JobCardModal'
import { getJob, getMaterials, getSerials, requestJobUpdate, type JobDTO, type MaterialLine } from '../lib/api'
import './JobDetail.css'

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved', in_production: 'In Production', in_qc: 'In QC', in_fg: 'In FG Stock',
  close_requested: 'Closure Requested', closed: 'Closed', cancelled: 'Cancelled', draft: 'Draft', pending_approval: 'Pending',
}
const stepState = (s: string) =>
  s === 'completed' ? 'done' : s === 'skipped' ? 'skipped' : s === 'in_progress' || s === 'waiting_acceptance' ? 'current' : s === 'on_hold' ? 'hold' : 'pending'

function stamp(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  let h = d.getHours()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${p(d.getDate())} ${m[d.getMonth()]} ${h}:${p(d.getMinutes())} ${ap}`
}
const evLabel = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function JobDetail({
  user,
  jobId,
  onBack,
  onLock,
}: {
  user: SessionUser
  jobId: string | null
  onBack: () => void
  onLock: () => void
}) {
  const [job, setJob] = useState<JobDTO | null>(null)
  const [materials, setMaterials] = useState<MaterialLine[]>([])
  const [serials, setSerials] = useState<{ serialNo: string }[]>([])
  const [err, setErr] = useState(false)
  const [reqBusy, setReqBusy] = useState(false)
  const [reqMsg, setReqMsg] = useState<string | null>(null)
  async function askUpdate() {
    if (!jobId) return
    setReqBusy(true); setReqMsg(null)
    try { const r = await requestJobUpdate(jobId); setReqMsg(`✓ Update requested from ${r.dept}`) }
    catch { setReqMsg('Could not request — the job may not be on the floor.') }
    finally { setReqBusy(false) }
  }
  const [showCard, setShowCard] = useState(false)
  const [showRecord, setShowRecord] = useState(false)

  useEffect(() => {
    if (!jobId) return
    getJob(jobId).then((r) => setJob(r.job)).catch(() => setErr(true))
    // raw-material genealogy + FG serials — admin/dept views; tolerate 403/empty
    getMaterials(jobId).then((r) => setMaterials(r.materials)).catch(() => {})
    getSerials(jobId).then((r) => setSerials(r.serials)).catch(() => {})
  }, [jobId])

  if (err) {
    return (
      <div className="app">
        <TopBar user={user} onLock={onLock} />
        <main className="app__body jobdetail">
          <header className="screen__head">
            <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
            <h1 className="jd__id display">Not found</h1>
          </header>
          <p className="jd__scannote mono-label" style={{ padding: 20 }}>That job code didn’t match any job.</p>
        </main>
        <BottomBar />
      </div>
    )
  }

  const steps = job?.steps ?? []
  const doneCount = steps.filter((s) => s.status === 'completed').length
  const current = steps.find((s) => stepState(s.status) === 'current' || stepState(s.status) === 'hold')
  const onHold = current && stepState(current.status) === 'hold'
  const closed = job?.status === 'closed'
  const events = job?.events ?? []

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobdetail">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="jd__id display">{job?.name || job?.displayLabel || 'Loading…'}</h1>
            <span className="mono-label">{job ? `${job.name ? job.displayLabel + ' · ' : ''}${job.product?.name ?? ''} · ${job.totalQty} units` : ''}</span>
          </div>
          {job && (
            <span className={`chip ${closed ? 'chip--good' : onHold ? 'chip--delay' : 'chip--good'}`}>
              {STATUS_LABEL[job.status] ?? job.status}
            </span>
          )}
        </header>

        <div className="jd__scroll">
          {!job ? (
            <span className="jd__scannote mono-label" style={{ padding: 20 }}>Loading…</span>
          ) : (
            <>
              {/* pipeline stepper */}
              <div className="jd__progress">
                <div className="jd__progress-head">
                  <span className="mono-label">Pipeline</span>
                  <span className="mono-label">{doneCount}/{steps.length} Departments</span>
                </div>
                <div className="stepper">
                  {steps.map((s, i) => {
                    const st = stepState(s.status)
                    return (
                      <div key={s.id} className={`step step--${st}`}>
                        <span className="step__node">{st === 'done' ? '✓' : st === 'skipped' ? '✕' : i + 1}</span>
                        <span className="step__label mono-label">{s.department.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* meta */}
              <div className="jd__meta">
                <div className="jd__cell"><span className="mono-label">Current</span><span className="jd__cell-v display">{current?.department.name ?? (closed ? 'Closed' : '—')}</span></div>
                <div className="jd__cell"><span className="mono-label">Priority</span><span className={`jd__cell-v display ${job.priority === 'urgent' ? 'is-brand' : ''}`}>{job.priority === 'urgent' ? 'Urgent' : 'Normal'}</span></div>
                <div className="jd__cell"><span className="mono-label">Start</span><span className="jd__cell-v display">{stamp(job.startDate ?? job.createdAt)?.split(' ').slice(0, 2).join(' ') || '—'}</span></div>
                <div className="jd__cell"><span className="mono-label">{closed ? 'Closed' : 'Updated'}</span><span className="jd__cell-v display">{stamp(job.completionDate)?.split(' ').slice(0, 2).join(' ') || '—'}</span></div>
              </div>

              <div className="jd__actions">
                <button className="btn btn--solid btn--block" onClick={() => setShowCard(true)}>▦ Show Job Card</button>
                {closed && (
                  <button className="btn btn--ghost btn--block" onClick={() => setShowRecord(true)}>🖨 Production Record</button>
                )}
                {user.role === 'ADMIN' && !closed && job.status !== 'cancelled' && (
                  <button className="btn btn--ghost btn--block" disabled={reqBusy} onClick={askUpdate}>{reqBusy ? 'Requesting…' : '↻ Request update from station'}</button>
                )}
                {reqMsg && <span className="jd__scannote mono-label" style={{ color: 'var(--text-secondary)' }}>{reqMsg}</span>}
                <span className="jd__scannote mono-label">ⓘ Stations advance this job by scanning its barcode — admins don’t complete steps.</span>
              </div>

              {/* pipeline-v2: production station trail (free / parallel scans) */}
              {(job.stationVisits?.length ?? 0) > 0 && (
                <div className="jd__section">
                  <span className="jd__section-title mono-label">Production Trail ({job.stationVisits!.length})</span>
                  <div className="jd__trail">
                    {job.stationVisits!.map((v) => (
                      <div key={v.id} className={`jd__visit ${v.scanOutAt ? '' : 'jd__visit--open'}`}>
                        <div className="jd__visit-head">
                          <b>{v.station.name}</b>
                          <span className="mono-label">
                            {stamp(v.scanInAt)?.split(' ').slice(2).join(' ')}
                            {v.scanOutAt ? ` → ${stamp(v.scanOutAt)?.split(' ').slice(2).join(' ')}${v.scanOutMode === 'auto' ? ' ★' : ''}` : ' · open'}
                          </span>
                        </div>
                        {v.remark && <span className="jd__visit-remark">{v.remark}</span>}
                        {v.qcIssue && !v.qcResolvedAt ? (
                          <span className="jd__qc jd__qc--issue">⚠ QC issue{v.qcNote ? ` · ${v.qcNote}` : ''}</span>
                        ) : v.qcIssue && v.qcResolvedAt ? (
                          <span className="jd__qc jd__qc--ok">✓ QC issue resolved</span>
                        ) : v.qcChecked ? (
                          <span className="jd__qc jd__qc--ok">✓ QC checked</span>
                        ) : null}
                        {v.photoUrl && <img className="jd__visit-photo" src={v.photoUrl} alt="" />}
                      </div>
                    ))}
                  </div>
                  <span className="jd__scannote mono-label">★ = station never scanned out (auto-closed).</span>
                </div>
              )}

              {/* pipeline-v2: parallel material / purchase needs */}
              {(job.materialRequests?.length ?? 0) > 0 && (
                <div className="jd__section">
                  <span className="jd__section-title mono-label">Material Needs ({job.materialRequests!.length})</span>
                  <div className="jd__matlist">
                    {job.materialRequests!.map((m) => (
                      <div key={m.id} className="jd__matline">
                        <b>{m.item}{m.quantity ? ` · ${m.quantity}` : ''} <span className={`jd__mtag jd__mtag--${m.status}`}>{m.status}</span></b>
                        <span className="mono-label">{[m.vendor && `vendor: ${m.vendor}`, m.note].filter(Boolean).join(' · ') || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* raw-material genealogy */}
              {materials.length > 0 && (
                <div className="jd__section">
                  <span className="jd__section-title mono-label">Raw Material ({materials.length})</span>
                  <div className="jd__matlist">
                    {materials.map((m) => (
                      <div key={m.id} className="jd__matline">
                        <b>{m.item}{m.quantity ? ` · ${m.quantity}` : ''}</b>
                        <span className="mono-label">{[m.materialType, m.vendor && `vendor: ${m.vendor}`, m.batchRef && `batch: ${m.batchRef}`].filter(Boolean).join(' · ') || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FG serial numbers */}
              {serials.length > 0 && (
                <div className="jd__section">
                  <span className="jd__section-title mono-label">Serial Numbers ({serials.length})</span>
                  <div className="jd__serials">
                    {serials.map((s) => <span key={s.serialNo} className="jd__serial mono-label">{s.serialNo}</span>)}
                  </div>
                </div>
              )}

              {/* timeline */}
              <div className="jd__section">
                <span className="jd__section-title mono-label">Timeline</span>
                {events.length === 0 ? (
                  <span className="jd__scannote mono-label">No events yet.</span>
                ) : (
                  <ol className="timeline">
                    {events.map((e) => (
                      <li className="tl" key={e.id}>
                        <span className="tl__dot" />
                        <span className="tl__body">
                          <span className="tl__type">{evLabel(e.type)}</span>
                          {e.body && <span className="tl__note mono-label">{e.body}</span>}
                        </span>
                        <span className="tl__meta mono-label">{stamp(e.createdAt)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <BottomBar />
      {showCard && job && <JobCardModal jobId={job.id} onClose={() => setShowCard(false)} />}
      {showRecord && job && <JobCardModal jobId={job.id} variant="record" onClose={() => setShowRecord(false)} />}
    </div>
  )
}
