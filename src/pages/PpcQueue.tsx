import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { listPpcRequests, type PpcRequest } from '../lib/api'
import './PpcQueue.css'

// The admin's PPC review queue: every pending request PPC has raised. Tap one
// to open it in the review form and approve → job.
export default function PpcQueue({
  user,
  onBack,
  onLock,
  onOpen,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
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
            <h1 className="screen__title display">PPC Requests</h1>
            <span className="mono-label">{requests ? `${requests.length} pending review` : 'Loading…'}</span>
          </div>
          <span />
        </header>

        <div className="screen__scroll">
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
