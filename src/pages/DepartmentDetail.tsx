import { useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './DepartmentDetail.css'

interface Job {
  id: string
  product: string
  qty: number
  pri: 'urgent' | 'normal'
  reason?: string
}

export default function DepartmentDetail({
  user,
  dept = 'CNC / VMC',
  head = 'Pratik',
  onBack,
  onLock,
  onOpenJob,
}: {
  user: SessionUser
  dept?: string
  head?: string
  onBack: () => void
  onLock: () => void
  onOpenJob: () => void
}) {
  const [waiting, setWaiting] = useState<Job[]>([
    { id: 'AT-U-045-080626-001', product: 'Alloy Truss', qty: 45, pri: 'urgent' },
  ])
  const [active, setActive] = useState<Job[]>([
    { id: 'MT-N-030-070626-002', product: 'MS Truss', qty: 30, pri: 'normal' },
    { id: 'SC-N-018-060626-006', product: 'Scaffolding', qty: 18, pri: 'normal' },
  ])
  const hold: Job[] = [
    { id: 'ST-N-012-050626-004', product: 'Stage', qty: 12, pri: 'normal', reason: 'Machine Breakdown' },
    { id: 'LF-N-009-050626-007', product: 'Lifter', qty: 9, pri: 'normal', reason: 'Awaiting Approval' },
  ]

  const accept = (job: Job) => {
    setWaiting((w) => w.filter((j) => j.id !== job.id))
    setActive((a) => [job, ...a])
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">{dept}</h1>
            <span className="mono-label">Head · {head}</span>
          </div>
        </header>

        <div className="screen__scroll">
          <div className="dd__summary">
            <div className="dd__stat"><b className="display">{String(active.length).padStart(2, '0')}</b><span className="mono-label">Active</span></div>
            <div className="dd__stat"><b className="display is-brand">{String(waiting.length).padStart(2, '0')}</b><span className="mono-label">Waiting</span></div>
            <div className="dd__stat"><b className={`display ${hold.length ? 'is-warning' : ''}`}>{String(hold.length).padStart(2, '0')}</b><span className="mono-label">On Hold</span></div>
          </div>

          {waiting.length > 0 && (
            <section className="jsec">
              <span className="jsec__title mono-label">Waiting For Acceptance <span className="jsec__count">{waiting.length}</span></span>
              <div className="jlist">
                {waiting.map((j) => (
                  <div key={j.id} className="jrow jrow--accept">
                    <span className={`jrow__pri jrow__pri--${j.pri}`} />
                    <button className="jrow__main jrow__main--btn" onClick={onOpenJob}>
                      <span className="jrow__id display">{j.id}</span>
                      <span className="jrow__sub mono-label">{j.product} · {j.qty} units</span>
                    </button>
                    <button className="btn btn--solid dd__accept" onClick={() => accept(j)}>Accept</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="jsec">
            <span className="jsec__title mono-label">In Progress <span className="jsec__count">{active.length}</span></span>
            <div className="jlist">
              {active.map((j) => (
                <button key={j.id} className="jrow" onClick={onOpenJob}>
                  <span className={`jrow__pri jrow__pri--${j.pri}`} />
                  <span className="jrow__main">
                    <span className="jrow__id display">{j.id}</span>
                    <span className="jrow__sub mono-label">{j.product} · {j.qty} units</span>
                  </span>
                  <span className="jstatus jstatus--in_progress mono-label"><span className="jstatus__dot" />In Progress</span>
                  <span className="jrow__arrow">→</span>
                </button>
              ))}
            </div>
          </section>

          <section className="jsec">
            <span className="jsec__title mono-label">On Hold <span className="jsec__count">{hold.length}</span></span>
            <div className="jlist">
              {hold.map((j) => (
                <button key={j.id} className="jrow" onClick={onOpenJob}>
                  <span className="jrow__pri jrow__pri--hold" />
                  <span className="jrow__main">
                    <span className="jrow__id display">{j.id}</span>
                    <span className="jrow__sub mono-label">{j.product} · {j.reason}</span>
                  </span>
                  <span className="jstatus jstatus--on_hold mono-label"><span className="jstatus__dot" />On Hold</span>
                  <span className="jrow__arrow">→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
