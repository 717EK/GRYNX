import { useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './MaintenanceDetail.css'

const FLOW = ['Open', 'Assigned', 'In Progress', 'Completed', 'Verified', 'Closed']

function nowStamp() {
  const d = new Date()
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  let h = d.getHours()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${p(d.getDate())} ${m[d.getMonth()]} ${h}:${p(d.getMinutes())} ${ap}`
}

export default function MaintenanceDetail({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  const [stage, setStage] = useState(2) // In Progress
  const [log, setLog] = useState<{ t: string; by: string; at: string }[]>([
    { t: 'Marked In Progress', by: 'Suresh', at: '08 Jun 11:05 AM' },
    { t: 'Assigned to Suresh', by: 'Admin', at: '08 Jun 10:40 AM' },
    { t: 'Ticket reported', by: 'Pratik', at: '08 Jun 10:20 AM' },
  ])

  const advance = () => {
    if (stage >= FLOW.length - 1) return
    const next = stage + 1
    setStage(next)
    setLog((l) => [{ t: `Marked ${FLOW[next]}`, by: user.name, at: nowStamp() }, ...l])
  }

  const nextLabel = stage < FLOW.length - 1 ? `Mark ${FLOW[stage + 1]}` : 'Closed'

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">MT-0007</h1>
            <span className="mono-label">Mechanical · CNC #3 Spindle</span>
          </div>
          <span className="pri-tag pri-tag--critical mono-label">CRITICAL</span>
        </header>

        <div className="screen__scroll">
          {/* status flow */}
          <div className="mdflow">
            {FLOW.map((f, i) => (
              <div key={f} className={`mdflow__step ${i < stage ? 'is-done' : ''} ${i === stage ? 'is-current' : ''}`}>
                <span className="mdflow__dot" />
                <span className="mdflow__label mono-label">{f}</span>
              </div>
            ))}
          </div>

          <div className="md__meta">
            <div className="jd__cell"><span className="mono-label">Location</span><span className="jd__cell-v display">CNC #3</span></div>
            <div className="jd__cell"><span className="mono-label">Category</span><span className="jd__cell-v display">Mechanical</span></div>
            <div className="jd__cell"><span className="mono-label">Reported</span><span className="jd__cell-v display">Pratik</span></div>
            <div className="jd__cell"><span className="mono-label">Assigned</span><span className="jd__cell-v display is-brand">Suresh</span></div>
          </div>

          <div className="md__desc">
            <span className="jd__section-title mono-label">Issue</span>
            <p className="md__desc-text">Spindle making abnormal noise and vibration under load. Production paused on the CNC / VMC line until inspected.</p>
          </div>

          <div className="md__actions">
            <button className="btn btn--solid btn--block" onClick={advance} disabled={stage >= FLOW.length - 1}>
              {nextLabel}
            </button>
          </div>

          <div className="jd__section">
            <span className="jd__section-title mono-label">Activity</span>
            <ol className="timeline">
              {log.map((e, i) => (
                <li className="tl" key={i}>
                  <span className="tl__dot" />
                  <span className="tl__body"><span className="tl__type">{e.t}</span></span>
                  <span className="tl__meta mono-label">{e.by} · {e.at}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
