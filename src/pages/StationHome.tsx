import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getQueue, designRelease, type QueueJob } from '../lib/api'
import './StationHome.css'
import './Maintenance.css'

// A floor station's home: the jobs heading their way + a big Scan button.
// Deliberately minimal — an operator should see their queue and scan, nothing else.
// DESIGN is special (pipeline-v2): mostly a double-check — they confirm a standard
// design (or attach a new design file) and forward to Production with a tap, no scan.
export default function StationHome({
  user,
  viewAs,
  onScan,
  onLock,
  onReport,
  onOpenJob,
  onExitViewAs,
}: {
  user: SessionUser
  viewAs: { id: string; name: string } | null
  onScan: () => void
  onLock: () => void
  onReport: () => void
  onOpenJob: (id: string) => void
  onExitViewAs?: () => void
}) {
  const [jobs, setJobs] = useState<QueueJob[] | null>(null)
  const [forwarding, setForwarding] = useState<QueueJob | null>(null)
  const stationName = viewAs?.name ?? user.role
  const isDesign = stationName.toLowerCase() === 'design'

  function load() {
    getQueue(viewAs?.id)
      .then((r) => setJobs(r.jobs))
      .catch(() => setJobs([]))
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewAs?.id])

  const here = jobs?.filter((j) => j.stepStatus === 'in_progress') ?? []
  const incoming = jobs?.filter((j) => j.stepStatus === 'waiting_acceptance') ?? []

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      {viewAs && (
        <div className="viewas-bar mono-label">
          VIEWING AS · {stationName}
          {onExitViewAs && (
            <button className="viewas-bar__exit" onClick={onExitViewAs}>
              EXIT ↩
            </button>
          )}
        </div>
      )}
      <main className="app__body station">
        <header className="station__head">
          <div className="station__head-text">
            <span className="mono-label station__kicker">STATION</span>
            <h1 className="station__title display">{stationName}</h1>
          </div>
          <button className="station__report-btn mono-label" onClick={onReport} title="Report an issue">⚠ REPORT</button>
        </header>

        <div className="station__scroll">
          {jobs === null ? (
            <span className="station__empty mono-label">Loading…</span>
          ) : jobs.length === 0 ? (
            <span className="station__empty mono-label">No jobs at your station right now.</span>
          ) : (
            <>
              {here.length > 0 && (
                <Section title={`At station (${here.length})`} jobs={here} tone="here" onOpenJob={onOpenJob} onForward={isDesign ? setForwarding : undefined} />
              )}
              {incoming.length > 0 && (
                <Section title={`Incoming (${incoming.length})`} jobs={incoming} tone="incoming" onOpenJob={onOpenJob} onForward={isDesign ? setForwarding : undefined} />
              )}
            </>
          )}
        </div>

        {/* Scan is the hero for scanning stations; Design forwards per-job instead. */}
        {!isDesign && (
          <button className="station__scan station__scan--hero" onClick={onScan}>
            <span className="station__scan-ico" aria-hidden>
              <svg viewBox="0 0 48 48" width="44" height="44" fill="currentColor">
                <path d="M4 4h14v14H4V4Zm3 3v8h8V7H7Zm2 2h4v4H9V9Z" />
                <path d="M30 4h14v14H30V4Zm3 3v8h8V7h-8Zm2 2h4v4h-4V9Z" />
                <path d="M4 30h14v14H4V30Zm3 3v8h8v-8H7Zm2 2h4v4H9v-4Z" />
                <path d="M22 4h4v4h-4V4Zm0 8h4v8h-8v-4h4v-4Zm-8 8h4v4h-4v-4Zm14 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM22 24h4v4h-4v-4Zm8 0h4v4h-4v-4Zm6 0h8v4h-4v4h-4v-8Zm-14 6h4v4h-4v-4Zm6 0h4v8h-4v-8Zm8 4h4v4h-4v-4Zm-4 6h4v4h-4v-4Zm8 0h4v4h-4v-4Z" />
              </svg>
            </span>
            <span className="station__scan-label">Scan Job Card</span>
            <span className="station__scan-sub mono-label">camera opens — point at the QR</span>
          </button>
        )}
      </main>
      <BottomBar />
      {forwarding && (
        <DesignForwardModal job={forwarding} onClose={() => setForwarding(null)} onDone={() => { setForwarding(null); load() }} />
      )}
    </div>
  )
}

function Section({
  title,
  jobs,
  tone,
  onOpenJob,
  onForward,
}: {
  title: string
  jobs: QueueJob[]
  tone: 'here' | 'incoming'
  onOpenJob: (id: string) => void
  onForward?: (j: QueueJob) => void
}) {
  return (
    <div className="station__section">
      <span className="station__section-title mono-label">{title}</span>
      {jobs.map((j) => (
        <div key={j.id} className={`qjob qjob--${tone}`} style={onForward ? { display: 'flex', alignItems: 'center' } : undefined}>
          <button className="qjob__main" style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', flex: 1 }} onClick={() => onOpenJob(j.id)}>
            <span className="qjob__label display">{j.name || j.displayLabel}</span>
            <span className="qjob__meta mono-label">
              {j.name ? `${j.displayLabel} · ` : ''}{j.product?.name ?? ''} · {j.totalQty} units
            </span>
          </button>
          <span className="qjob__right">
            {j.priority === 'urgent' && <span className="qjob__urgent mono-label">URGENT</span>}
            {onForward ? (
              <button className="btn btn--solid" style={{ padding: '7px 12px', fontSize: 12 }} onClick={() => onForward(j)}>
                ✓ Forward
              </button>
            ) : (
              <span className={`qjob__dot qjob__dot--${tone}`} />
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

// Design's double-check: confirm the standard design, or attach a new design
// file (image, compressed) — then the job moves to Production. No card scan.
function DesignForwardModal({ job, onClose, onDone }: { job: QueueJob; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [fileUrl, setFileUrl] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onFile(file: File) {
    const img = new Image()
    const url = URL.createObjectURL(file)
    try {
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
      const max = 1400
      const sc = Math.min(1, max / Math.max(img.width, img.height))
      const cv = document.createElement('canvas')
      cv.width = Math.round(img.width * sc)
      cv.height = Math.round(img.height * sc)
      cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height)
      setFileUrl(cv.toDataURL('image/jpeg', 0.8))
    } catch {
      setErr('Could not read that file — use an image (photo/screenshot of the drawing)')
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function forward() {
    setBusy(true)
    setErr(null)
    try {
      await designRelease(job.id, { note: note.trim() || undefined, fileUrl })
      onDone()
    } catch {
      setErr('Could not forward — try again')
      setBusy(false)
    }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">{job.name || job.displayLabel}</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
          {job.product?.name} · {job.totalQty} units — confirm design & forward to Production
        </span>
        <label className="mnt__field">
          <span className="mono-label">Note · optional</span>
          <input className="mnt__input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. standard LD38 grid, no changes" />
        </label>
        <label className="mnt__field" style={{ cursor: 'pointer' }}>
          <span className="mono-label">New design file · optional</span>
          {fileUrl ? (
            <img src={fileUrl} alt="design" style={{ maxHeight: 120, borderRadius: 8, border: '1px solid var(--border)' }} />
          ) : (
            <span className="mnt__input" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>📎 Attach drawing (photo / screenshot)</span>
          )}
          <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {err && <span className="mnt__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={forward}>
          {busy ? 'Forwarding…' : '✓ Confirm & forward to Production'}
        </button>
      </div>
    </div>
  )
}
