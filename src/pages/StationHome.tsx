import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getQueue, type QueueJob } from '../lib/api'
import './StationHome.css'

// A production station's home: the jobs heading their way + a big Scan button.
// Deliberately minimal — an operator should see their queue and scan, nothing else.
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
  const stationName = viewAs?.name ?? user.role

  useEffect(() => {
    let alive = true
    getQueue(viewAs?.id)
      .then((r) => alive && setJobs(r.jobs))
      .catch(() => alive && setJobs([]))
    return () => {
      alive = false
    }
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
                <Section title={`At station (${here.length})`} jobs={here} tone="here" onOpenJob={onOpenJob} />
              )}
              {incoming.length > 0 && (
                <Section title={`Incoming (${incoming.length})`} jobs={incoming} tone="incoming" onOpenJob={onOpenJob} />
              )}
            </>
          )}
        </div>

        {/* Scan is the hero — pinned at the bottom, thumb-reachable. */}
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
      </main>
      <BottomBar />
    </div>
  )
}

function Section({
  title,
  jobs,
  tone,
  onOpenJob,
}: {
  title: string
  jobs: QueueJob[]
  tone: 'here' | 'incoming'
  onOpenJob: (id: string) => void
}) {
  return (
    <div className="station__section">
      <span className="station__section-title mono-label">{title}</span>
      {jobs.map((j) => (
        <button key={j.id} className={`qjob qjob--${tone}`} onClick={() => onOpenJob(j.id)}>
          <span className="qjob__main">
            <span className="qjob__label display">{j.name || j.displayLabel}</span>
            <span className="qjob__meta mono-label">
              {j.name ? `${j.displayLabel} · ` : ''}{j.product?.name ?? ''} · {j.totalQty} units
            </span>
          </span>
          <span className="qjob__right">
            {j.priority === 'urgent' && <span className="qjob__urgent mono-label">URGENT</span>}
            <span className={`qjob__dot qjob__dot--${tone}`} />
          </span>
        </button>
      ))}
    </div>
  )
}
