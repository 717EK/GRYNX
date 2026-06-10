import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import {
  listUsers, approveUser, createUser, resetUserPin, setUserStatus, getDepartments,
  type PendingUser, type DeptLite,
} from '../lib/api'
import './Maintenance.css'
import './DeptHome.css'
import './Departments.css'
import './UserManager.css'

const ROLES = [
  ['dept_head', 'Floor / Dept Head'],
  ['ppc', 'PPC'],
  ['qc', 'QC'],
  ['fg_stock', 'FG Stock'],
  ['maintenance', 'Maintenance'],
  ['admin', 'Admin'],
] as const
const roleLabel = (r: string) => ROLES.find((x) => x[0] === r)?.[1] ?? r

export default function UserManager({ user, onBack, onLock }: { user: SessionUser; onBack: () => void; onLock: () => void }) {
  const [users, setUsers] = useState<PendingUser[] | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'suspended'>('all')
  const [depts, setDepts] = useState<DeptLite[]>([])
  const [adding, setAdding] = useState(false)
  const [active, setActive] = useState<PendingUser | null>(null)

  async function load() {
    try {
      const { users } = await listUsers(filter === 'all' ? undefined : filter)
      setUsers(users)
    } catch {
      setUsers([])
    }
  }
  useEffect(() => { void load() }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getDepartments().then((d) => setDepts(d.departments)).catch(() => {}) }, [])

  const pending = (users ?? []).filter((u) => u.status === 'pending').length

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Users</h1>
            <span className="mono-label">{users ? `${users.length} users · ${pending} pending` : 'Loading…'}</span>
          </div>
          <button className="um__add mono-label" onClick={() => setAdding(true)}>+ ADD</button>
        </header>
        <div className="um__filters">
          {(['all', 'pending', 'active', 'suspended'] as const).map((f) => (
            <button key={f} className={`um__chip mono-label ${filter === f ? 'is-active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
          ))}
        </div>
        <div className="screen__scroll">
          {users === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : users.length === 0 ? (
            <span className="dh__empty mono-label">No {filter === 'all' ? '' : filter + ' '}users.</span>
          ) : (
            <ul className="dh__list">
              {users.map((u) => (
                <li key={u.id}>
                  <button className="dh__row" onClick={() => setActive(u)}>
                    <span className="dh__main">
                      <span className="dh__label display">{u.fullName} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 12 }}>· {u.username}</span></span>
                      <span className="dh__meta mono-label">{u.roles.map((r) => roleLabel(r.role) + (r.department ? ` (${r.department.code})` : '')).join(' · ') || 'no role'}</span>
                    </span>
                    <span className={`dh__tag mono-label ${u.status === 'active' ? 'dh__tag--ok' : u.status === 'pending' ? 'dh__tag--info' : 'dh__tag--urgent'}`}>{u.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
      {adding && <AddUser depts={depts} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void load() }} />}
      {active && <UserActions u={active} onClose={() => setActive(null)} onDone={() => { setActive(null); void load() }} />}
    </div>
  )
}

function AddUser({ depts, onClose, onDone }: { depts: DeptLite[]; onClose: () => void; onDone: () => void }) {
  const [username, setU] = useState('')
  const [fullName, setF] = useState('')
  const [pin, setP] = useState('')
  const [role, setRole] = useState('dept_head')
  const [departmentId, setDept] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const needsDept = role === 'dept_head'

  async function submit() {
    if (!username.trim() || !fullName.trim() || !/^\d{6}$/.test(pin)) { setErr('Name, username and a 6-digit PIN are required'); return }
    if (needsDept && !departmentId) { setErr('Pick a department for a floor user'); return }
    setBusy(true); setErr(null)
    try {
      await createUser({ username: username.trim(), fullName: fullName.trim(), pin, role, departmentId: departmentId || undefined })
      onDone()
    } catch (e) { setErr((e as Error)?.message === 'username_taken' ? 'That username is taken' : 'Could not create user'); setBusy(false) }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head"><span className="display mnt__modal-title">Add user</span><button className="modal__x" onClick={onClose}>×</button></div>
        <input className="mnt__input" placeholder="Full name" value={fullName} onChange={(e) => setF(e.target.value)} />
        <input className="mnt__input" placeholder="Login ID (username)" autoCapitalize="none" value={username} onChange={(e) => setU(e.target.value)} />
        <input className="mnt__input" placeholder="6-digit PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setP(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <select className="mnt__select" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {needsDept && (
          <select className="mnt__select" value={departmentId} onChange={(e) => setDept(e.target.value)}>
            <option value="">— department —</option>
            {depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {err && <span className="mnt__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create user'}</button>
      </div>
    </div>
  )
}

function UserActions({ u, onClose, onDone }: { u: PendingUser; onClose: () => void; onDone: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, done?: boolean) => { setBusy(true); try { await fn(); if (done) onDone(); else setMsg('Done.') } catch { setMsg('Failed.') } finally { setBusy(false) } }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head"><span className="display mnt__modal-title">{u.fullName} · {u.username}</span><button className="modal__x" onClick={onClose}>×</button></div>
        <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Status: {u.status} · {u.roles.map((r) => roleLabel(r.role)).join(', ') || 'no role'}</span>
        {u.status === 'pending' && <button className="btn btn--solid btn--block" disabled={busy} onClick={() => run(() => approveUser(u.id), true)}>Approve sign-in</button>}
        {u.status !== 'suspended' ? (
          <button className="btn btn--danger btn--block" disabled={busy} onClick={() => run(() => setUserStatus(u.id, 'suspended'), true)}>Suspend</button>
        ) : (
          <button className="btn btn--solid btn--block" disabled={busy} onClick={() => run(() => setUserStatus(u.id, 'active'), true)}>Re-activate</button>
        )}
        <div className="mnt__row2" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
          <input className="mnt__input" placeholder="New 6-digit PIN" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          <button className="btn btn--primary" disabled={busy || !/^\d{6}$/.test(pin)} onClick={() => run(async () => { await resetUserPin(u.id, pin); setPin('') })}>Reset PIN</button>
        </div>
        {msg && <span className="mnt__err mono-label" style={{ color: 'var(--text-secondary)' }}>{msg}</span>}
      </div>
    </div>
  )
}
