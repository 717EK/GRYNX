import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { listPpcRequests, type PpcRequest } from '../lib/api'
import './PpcQueue.css'
import './JobHub.css'

// The admin's job entry point. Two clear intents: start a brand-new job, or pick
// up a request PPC already raised. PPC requests open as a read-only job sheet
// (PpcReviewSheet) — not a form — so review is the default and editing is opt-in.
export default function JobHub({
  user,
  onBack,
  onLock,
  onNew,
  onOpen,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onNew: () => void
  onOpen: (req: PpcRequest) => void
}) {
  const [requests, setRequests] = useState<PpcRequest[] | null>(null)
  useEffect(() => {
    listPpcRequests('submitted')
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]))
  }, [])

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Create Job</h1>
            <span className="mono-label">Start fresh, or approve a PPC request</span>
          </div>
          <span />
        </header>

        <div className="screen__scroll">
          <button className="jobhub__new" onClick={onNew}>
            <span className="jobhub__plus" aria-hidden>＋</span>
            <span className="jobhub__new-text">
              <span className="jobhub__new-title display">Create a new job</span>
              <span className="mono-label">Build a job from scratch</span>
            </span>
            <span className="jobhub__chev" aria-hidden>›</span>
          </button>

          <span className="jobhub__group mono-label">
            PPC Requests {requests ? `· ${requests.length} pending` : ''}
          </span>

          {requests === null ? (
            <span className="ppcq__empty mono-label">Loading…</span>
          ) : requests.length === 0 ? (
            <span className="ppcq__empty mono-label">No pending PPC requests.</span>
          ) : (
            <ul className="ppcq__list">
              {requests.map((r) => {
                const qty = r.models.reduce((s, m) => s + m.quantity, 0)
                return (
                  <li key={r.id}>
                    <button className="ppcq__card" onClick={() => onOpen(r)}>
                      <span className="ppcq__top">
                        <span className="ppcq__no display">{r.requestNo}</span>
                        {r.priority === 'urgent' && <span className="ppcq__urgent mono-label">URGENT</span>}
                      </span>
                      <span className="ppcq__meta mono-label">
                        {r.product.name} · {qty} units · {r.models.length} line{r.models.length > 1 ? 's' : ''}
                      </span>
                      <span className="ppcq__models mono-label">
                        {r.models.slice(0, 3).map((m) => `${m.model.code} ${m.size ?? ''}`.trim()).join(' · ')}
                        {r.models.length > 3 ? ' …' : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
