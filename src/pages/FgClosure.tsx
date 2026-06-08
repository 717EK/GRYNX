import { useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './WorkflowList.css'

interface FJob {
  id: string
  product: string
  qty: number
}

export default function FgClosure({
  user,
  onBack,
  onLock,
  onOpenJob,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenJob: () => void
}) {
  const [received, setReceived] = useState<FJob[]>([
    { id: 'AT-N-020-040626-001', product: 'Alloy Truss', qty: 20 },
    { id: 'LF-N-006-030626-002', product: 'Lifter Alloy/MS', qty: 6 },
  ])
  const requested = [
    { id: 'MJ-N-010-020626-001', product: 'Mojo Alloy/MS', qty: 10, status: 'Awaiting Admin' },
  ]

  const requestClosure = (id: string) => setReceived((r) => r.filter((j) => j.id !== id))

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">FG Stock</h1>
            <span className="mono-label">Receive · verify · request closure</span>
          </div>
          <span />
        </header>
        <div className="screen__scroll">
          <section className="jsec">
            <span className="jsec__title mono-label">Received — Verify &amp; Close <span className="jsec__count">{received.length}</span></span>
            <div className="wf__list">
              {received.map((j) => (
                <div key={j.id} className="wf__card">
                  <button className="wf__main" onClick={onOpenJob}>
                    <span className="wf__id display">{j.id}</span>
                    <span className="wf__sub mono-label">{j.product} · {j.qty} units received</span>
                  </button>
                  <div className="wf__actions">
                    <button className="btn btn--solid wf__btn" onClick={() => requestClosure(j.id)}>Request Closure</button>
                  </div>
                </div>
              ))}
              {received.length === 0 && <p className="wf__empty mono-label">Nothing waiting to close ✓</p>}
            </div>
          </section>

          <section className="jsec">
            <span className="jsec__title mono-label">Closure Requested <span className="jsec__count">{requested.length}</span></span>
            <div className="wf__list">
              {requested.map((j) => (
                <button key={j.id} className="wf__card wf__card--row" onClick={onOpenJob}>
                  <span className="wf__main">
                    <span className="wf__id display">{j.id}</span>
                    <span className="wf__sub mono-label">{j.product} · {j.qty} units</span>
                  </span>
                  <span className="status jstatus--waiting mono-label"><span className="jstatus__dot" />{j.status}</span>
                </button>
              ))}
            </div>
            <p className="wf__note mono-label">ⓘ Only Admin can approve closure. Job closes once approved.</p>
          </section>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
