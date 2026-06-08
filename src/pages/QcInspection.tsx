import { useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './WorkflowList.css'

interface QJob {
  id: string
  product: string
  qty: number
  from: string
}

export default function QcInspection({
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
  const [inbox, setInbox] = useState<QJob[]>([
    { id: 'AT-N-020-070626-010', product: 'Alloy Truss', qty: 20, from: 'Powder Coat' },
    { id: 'MT-N-016-070626-011', product: 'MS Truss', qty: 16, from: 'Powder Coat' },
    { id: 'SC-N-008-060626-009', product: 'Scaffolding', qty: 8, from: 'MNTR' },
  ])
  const [rework, setRework] = useState<string | null>(null)

  const approve = (id: string) => setInbox((q) => q.filter((j) => j.id !== id))
  const sendRework = (reason: string) => {
    setInbox((q) => q.filter((j) => j.id !== rework))
    setRework(null)
    void reason
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Quality Control</h1>
            <span className="mono-label">Final inspection · approve or rework</span>
          </div>
          <span className="wf__count mono-label">{inbox.length} In Queue</span>
        </header>
        <div className="screen__scroll">
          <div className="wf__list">
            {inbox.map((j) => (
              <div key={j.id} className="wf__card">
                <button className="wf__main" onClick={onOpenJob}>
                  <span className="wf__id display">{j.id}</span>
                  <span className="wf__sub mono-label">{j.product} · {j.qty} units · from {j.from}</span>
                </button>
                <div className="wf__actions">
                  <button className="btn btn--solid wf__btn" onClick={() => approve(j.id)}>✓ Approve → FG</button>
                  <button className="btn btn--danger wf__btn" onClick={() => setRework(j.id)}>Rework</button>
                </div>
              </div>
            ))}
            {inbox.length === 0 && <p className="wf__empty mono-label">QC queue clear ✓</p>}
          </div>
        </div>
      </main>
      <BottomBar />

      {rework && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => setRework(null)}>
          <div className="modal__card" onClick={(e) => e.stopPropagation()}>
            <div className="modal__head">
              <h3 className="modal__title display">Send Rework</h3>
              <button className="modal__x" onClick={() => setRework(null)} aria-label="Close">×</button>
            </div>
            <p className="wf__rework-note mono-label">Rework creates a new linked job starting at the chosen department.</p>
            <div className="holdlist">
              {['Powder Coat Damage', 'Weld Defect', 'Dimension Out of Spec', 'Surface Finish'].map((r) => (
                <button key={r} className="holdlist__item" onClick={() => sendRework(r)}>{r}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
