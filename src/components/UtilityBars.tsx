import { useEffect, useState } from 'react'
import { useClock } from '../lib/useClock'
import { useConnection, type Conn } from '../lib/useConnection'
import { navTo } from '../lib/nav'
import { notificationCount, getUser } from '../lib/api'
import ThemePicker from './ThemePicker'
import grynxWordmark from '../assets/grynx-wordmark.png'
import dlyftWordmark from '../assets/dlyft-wordmark.png'
import dlyftWordmarkLight from '../assets/dlyft-wordmark-light.png'

export interface SessionUser {
  name: string
  role: string
  id: string
}

export const APP_VERSION = 'v0.7.4'

function Brand({ inApp }: { inApp?: boolean }) {
  return (
    <div className="ubar__left">
      <img className="logo-grynx-img" src={grynxWordmark} alt="GRYNX" />
      {inApp && (
        <>
          <span className="vrule" />
          <img className="logo-dlyft-sm logo--dark" src={dlyftWordmark} alt="D-LYFT" />
          <img className="logo-dlyft-sm logo--light" src={dlyftWordmarkLight} alt="D-LYFT" />
        </>
      )}
    </div>
  )
}

function Seg({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="seg">
      <span className="seg__k">{k}</span>
      <span className="seg__v">{v}</span>
    </div>
  )
}

export function TopBar({
  user,
  onLock,
  theme,
}: {
  user?: SessionUser
  onLock?: () => void
  /** Show the accent/mode picker — login screen only. */
  theme?: boolean
}) {
  const time = useClock()
  const [unread, setUnread] = useState(0)
  // keep the bell badge live — poll the unread count while signed in
  useEffect(() => {
    if (!user) return
    let alive = true
    const tick = () => notificationCount().then((r) => alive && setUnread(r.unread)).catch(() => {})
    tick()
    const h = setInterval(tick, 30_000)
    window.addEventListener('grynx-notif-changed', tick) // instant refresh on clear
    return () => {
      alive = false
      clearInterval(h)
      window.removeEventListener('grynx-notif-changed', tick)
    }
  }, [user])
  return (
    <header className="ubar ubar--top">
      <Brand inApp={!!user} />

      {/* full segments (tablet/desktop) — live link status now lives in the footer */}
      <div className="ubar__mid">
        <Seg k="SYNC" v={time} />
      </div>

      <div className="ubar__right">
        {user && (
          <div className="userid">
            <span className="userid__name">{user.name}</span>
            <span className="userid__sub">{user.role} · ID {user.id}</span>
          </div>
        )}
        {user && (
          <button className="iconbtn iconbtn--bell" title={`Notifications${unread ? ` (${unread} unread)` : ''}`} onClick={() => navTo('notifications')}>
            {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
              <path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
              <path d="M10 20a2 2 0 0 0 4 0" />
            </svg>
          </button>
        )}
        {user && (
          <button className="iconbtn" title="Lock / sign out" onClick={onLock}>
            ⏻
          </button>
        )}
        {theme && <ThemePicker />}
      </div>
    </header>
  )
}

const CONN: Record<Conn, { label: string; cls: string }> = {
  online: { label: 'ONLINE', cls: 'conn--online' },
  offline: { label: 'OFFLINE', cls: 'conn--offline' },
  demo: { label: 'DEMO', cls: 'conn--demo' },
}

export function BottomBar({ onScan }: { onScan?: () => void } = {}) {
  const conn = useConnection()
  const { label, cls } = CONN[conn]
  // SuperUser (Administrator) uses the connection pill as a universal escape back
  // to the View As panel — so testing any department is never a dead end.
  const isSuper = (getUser()?.username ?? '').toLowerCase() === 'admin'
  const connPill = isSuper ? (
    <button className={`conn conn--btn ${cls}`} onClick={() => navTo('viewas')} title="Back to View As">
      <span className="conn__dot" />
      {label} · VIEW AS ↩
    </button>
  ) : (
    <span className={`conn ${cls}`}>
      <span className="conn__dot" />
      {label}
    </span>
  )
  // onScan: the scanner is the hero of the bar — a rounded-rectangle button in
  // the centre (admin scans a job card to pull its history). Status sits right.
  if (onScan) {
    return (
      <footer className="ubar ubar--bottom ubar--bottom-scan">
        <span className="ubar__version">GRYNX {APP_VERSION}</span>
        <button className="bbar__scan" onClick={onScan} title="Scan a job card for its history" aria-label="Scan job card">
          <svg viewBox="0 0 48 48" width="20" height="20" fill="currentColor" aria-hidden>
            <path d="M4 4h14v14H4V4Zm3 3v8h8V7H7Zm2 2h4v4H9V9Z" />
            <path d="M30 4h14v14H30V4Zm3 3v8h8V7h-8Zm2 2h4v4h-4V9Z" />
            <path d="M4 30h14v14H4V30Zm3 3v8h8v-8H7Zm2 2h4v4H9v-4Z" />
            <path d="M22 4h4v4h-4V4Zm0 8h4v8h-8v-4h4v-4Zm-8 8h4v4h-4v-4Zm14 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM22 24h4v4h-4v-4Zm8 0h4v4h-4v-4Zm6 0h8v4h-4v4h-4v-8Zm-14 6h4v4h-4v-4Zm6 0h4v8h-4v-8Zm8 4h4v4h-4v-4Zm-4 6h4v4h-4v-4Zm8 0h4v4h-4v-4Z" />
          </svg>
          <span className="bbar__scan-label">SCAN</span>
        </button>
        <span className="bbar__right">{connPill}</span>
      </footer>
    )
  }
  return (
    <footer className="ubar ubar--bottom">
      <span className="ubar__version">GRYNX {APP_VERSION}</span>
      {connPill}
      <span className="ubar__secure">{conn === 'demo' ? 'LOCAL DATA' : 'ENCRYPTED · TLS'}</span>
    </footer>
  )
}
