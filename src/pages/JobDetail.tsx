import { useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './JobDetail.css'

type StepState = 'done' | 'current' | 'hold' | 'pending'

interface Step {
  dept: string
  state: StepState
  by?: string
  at?: string
}

interface Event {
  type: string
  by: string
  at: string
  note?: string
}

function nowStamp() {
  const d = new Date()
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  let h = d.getHours()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${p(d.getDate())} ${m[d.getMonth()]} ${h}:${p(d.getMinutes())} ${ap}`
}

export default function JobDetail({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  const [steps] = useState<Step[]>([
    { dept: 'Design', state: 'done', by: 'Aashish', at: '06 Jun 09:12 AM' },
    { dept: 'Purchase', state: 'done', by: 'Vikram', at: '07 Jun 11:40 AM' },
    { dept: 'Laser / Cutting', state: 'done', by: 'Javed', at: '07 Jun 04:05 PM' },
    { dept: 'Alloy Production', state: 'done', by: 'Manoj', at: '08 Jun 10:20 AM' },
    { dept: 'CNC / VMC', state: 'current', by: 'Pratik', at: '08 Jun 12:30 PM' },
    { dept: 'MNTR', state: 'pending' },
    { dept: 'Powder Coat', state: 'pending' },
    { dept: 'FG Stock', state: 'pending' },
  ])
  const [events, setEvents] = useState<Event[]>([
    { type: 'CNC / VMC accepted', by: 'Pratik', at: '08 Jun 12:30 PM' },
    { type: 'Alloy Production completed', by: 'Manoj', at: '08 Jun 10:20 AM' },
    { type: 'Laser / Cutting completed', by: 'Javed', at: '07 Jun 04:05 PM' },
    { type: 'Purchase completed', by: 'Vikram', at: '07 Jun 11:40 AM' },
    { type: 'Design completed', by: 'Aashish', at: '06 Jun 02:15 PM' },
    { type: 'Job created', by: 'Aashish', at: '06 Jun 09:00 AM' },
  ])
  const current = steps.find((s) => s.state === 'current' || s.state === 'hold')
  const onHold = current?.state === 'hold'
  const doneCount = steps.filter((s) => s.state === 'done').length

  const addEvent = (type: string) =>
    setEvents((e) => [{ type, by: user.name, at: nowStamp() }, ...e])

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobdetail">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="jd__id display">AT-U-045-080626-001</h1>
            <span className="mono-label">Alloy Truss · 45 units</span>
          </div>
          <span className={`chip ${onHold ? 'chip--delay' : 'chip--good'}`}>
            {onHold ? 'ON HOLD' : 'IN PROGRESS'}
          </span>
        </header>

        <div className="jd__scroll">
          {/* progress stepper */}
          <div className="jd__progress">
            <div className="jd__progress-head">
              <span className="mono-label">Pipeline</span>
              <span className="mono-label">
                {doneCount}/{steps.length} Departments
              </span>
            </div>
            <div className="stepper">
              {steps.map((s, i) => (
                <div key={s.dept} className={`step step--${s.state}`}>
                  <span className="step__node">{s.state === 'done' ? '✓' : i + 1}</span>
                  <span className="step__label mono-label">{s.dept}</span>
                </div>
              ))}
            </div>
          </div>

          {/* meta */}
          <div className="jd__meta">
            <div className="jd__cell">
              <span className="mono-label">Current</span>
              <span className="jd__cell-v display">{current?.dept ?? '—'}</span>
            </div>
            <div className="jd__cell">
              <span className="mono-label">Priority</span>
              <span className="jd__cell-v display is-brand">Urgent</span>
            </div>
            <div className="jd__cell">
              <span className="mono-label">Start</span>
              <span className="jd__cell-v display">06 Jun</span>
            </div>
            <div className="jd__cell">
              <span className="mono-label">Target</span>
              <span className="jd__cell-v display">15 Jun</span>
            </div>
          </div>

          {/* actions — admin view: request updates & reprint the job card.
              Stations advance the job by SCANNING the card, not by buttons. */}
          <div className="jd__actions">
            <button className="btn btn--solid btn--block" onClick={() => addEvent('Update requested')}>
              ↻ Request Update
            </button>
            <button className="btn btn--ghost btn--block">▦ Print Job Card</button>
            <span className="jd__scannote mono-label">
              ⓘ Stations advance this job by scanning its barcode — admins don’t complete steps.
            </span>
          </div>

          {/* timeline */}
          <div className="jd__section">
            <span className="jd__section-title mono-label">Timeline</span>
            <ol className="timeline">
              {events.map((e, i) => (
                <li className="tl" key={i}>
                  <span className="tl__dot" />
                  <span className="tl__body">
                    <span className="tl__type">{e.type}</span>
                    {e.note && <span className="tl__note mono-label">{e.note}</span>}
                  </span>
                  <span className="tl__meta mono-label">
                    {e.by} · {e.at}
                  </span>
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
