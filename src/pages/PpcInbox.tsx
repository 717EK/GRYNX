import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { listMyPpcRequests, type PpcRequest } from '../lib/api'
import './PpcQueue.css'

const TAG: Record<string, { label: string; cls: string }> = {
  pending_confirm: { label: 'CONFIRM', cls: 'ppcq__tag--wait' },
  clarification: { label: 'FIX', cls: 'ppcq__tag--rc' },
  submitted: { label: 'WITH ADMIN', cls: 'ppcq__tag--info' },
}

// PPC's own inbox: requests the admin has acted on. pending_confirm = confirm the
// admin's proposed edits; clarification = fix & resubmit after an RC.
export default function PpcInbox({
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
    listMyPpcRequests()
      .then((r) => setRequests(r.requests))
      .catch(() => setRequests([]))
  }, [])

  const actionable = (requests ?? []).filter((r) => r.status === 'pending_confirm' || r.status === 'clarification').length

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">My Requests</h1>
            <span className="mono-label">{requests ? `${actionable} need action` : 'Loading…'}</span>
          </div>
          <span />
        </header>

        <div className="screen__scroll">
          {requests === null ? (
            <span className="ppcq__empty mono-label">Loading…</span>
          ) : requests.length === 0 ? (
            <span className="ppcq__empty mono-label">Nothing pending — raise a request to get started.</span>
          ) : (
            <ul className="ppcq__list">
              {requests.map((r) => {
                const qty = r.models.reduce((s, m) => s + m.quantity, 0)
                const tag = TAG[r.status] ?? TAG.submitted
                const tappable = r.status === 'pending_confirm' || r.status === 'clarification'
                return (
                  <li key={r.id}>
                    <button className="ppcq__card" onClick={() => tappable && onOpen(r)} disabled={!tappable}>
                      <span className="ppcq__top">
                        <span className="ppcq__no display">{r.requestNo}</span>
                        <span className={`ppcq__tag mono-label ${tag.cls}`}>{tag.label}</span>
                      </span>
                      <span className="ppcq__meta mono-label">
                        {r.product.name} · {qty} units · {r.models.length} line{r.models.length > 1 ? 's' : ''}
                      </span>
                      {r.clarificationNote && <span className="ppcq__models mono-label">“{r.clarificationNote}”</span>}
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
