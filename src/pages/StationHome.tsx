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
          <span className="mono-label station__kicker">STATION</span>
          <h1 className="station__title display">{stationName}</h1>
        </header>

        <button className="station__scan" onClick={onScan}>
          <span className="station__scan-ico">▣</span>
          <span>Scan Job Card</span>
          <span className="station__scan-sub mono-label">on arrival at your station</span>
        </button>

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

        <button className="station__report" onClick={onReport}>
          ⚠ Report an issue
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
            <span className="qjob__label display">{j.displayLabel}</span>
            <span className="qjob__meta mono-label">
              {j.product?.name ?? ''} · {j.totalQty} units
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
