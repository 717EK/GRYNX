import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { listUsers, approveUser, rejectUser, type PendingUser } from '../lib/api'
import './Approvals.css'

export default function Approvals({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  const [users, setUsers] = useState<PendingUser[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    setErr(null)
    try {
      const { users } = await listUsers('pending')
      setUsers(users)
    } catch {
      setErr('Could not load pending accounts')
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function act(id: string, approve: boolean) {
    setBusyId(id)
    try {
      await (approve ? approveUser(id) : rejectUser(id))
      setUsers((us) => (us ? us.filter((u) => u.id !== id) : us))
    } catch {
      setErr('Action failed — try again')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobscreen">
        <header className="jobscreen__head">
          <button className="jobscreen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="jobscreen__titles">
            <h1 className="jobscreen__title display">Approvals</h1>
            <span className="mono-label">Pending account requests</span>
          </div>
          <button className="jobscreen__pill" onClick={() => void load()} title="Refresh">
            <span className="mono-label">↻</span>
          </button>
        </header>

        <div className="jobscreen__scroll">
          {err && <span className="appr__err mono-label">{err}</span>}
          {!users ? (
            <span className="appr__empty mono-label">Loading…</span>
          ) : users.length === 0 ? (
            <div className="appr__empty-wrap">
              <span className="appr__badge mono-label">✓ ALL CLEAR</span>
              <p className="appr__emptymsg">No pending account requests.</p>
            </div>
          ) : (
            <ul className="appr__list">
              {users.map((u) => (
                <li className="appr__row" key={u.id}>
                  <div className="appr__who">
                    <span className="appr__name display">{u.fullName}</span>
                    <span className="appr__meta mono-label">
                      {u.username} · {u.roles[0]?.department?.name ?? '—'}
                    </span>
                  </div>
                  <div className="appr__ctl">
                    <button className="appr__btn appr__btn--rej" disabled={busyId === u.id} onClick={() => act(u.id, false)}>
                      Reject
                    </button>
                    <button className="appr__btn appr__btn--ok" disabled={busyId === u.id} onClick={() => act(u.id, true)}>
                      {busyId === u.id ? '…' : 'Approve'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
