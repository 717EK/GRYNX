import { useClock } from '../lib/useClock'
import { useConnection, type Conn } from '../lib/useConnection'
import { navTo } from '../lib/nav'
import ThemePicker from './ThemePicker'
import grynxWordmark from '../assets/grynx-wordmark.png'
import dlyftWordmark from '../assets/dlyft-wordmark.png'
import dlyftWordmarkLight from '../assets/dlyft-wordmark-light.png'

export interface SessionUser {
  name: string
  role: string
  id: string
}

const APP_VERSION = 'v0.2.0'

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
          <button className="iconbtn iconbtn--bell" title="Notifications" onClick={() => navTo('notifications')}>
            <span className="bell-dot" />
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

export function BottomBar() {
  const conn = useConnection()
  const { label, cls } = CONN[conn]
  return (
    <footer className="ubar ubar--bottom">
      <span className="ubar__version">GRYNX {APP_VERSION}</span>
      <span className={`conn ${cls}`}>
        <span className="conn__dot" />
        {label}
      </span>
      <span className="ubar__secure">{conn === 'demo' ? 'LOCAL DATA' : 'ENCRYPTED · TLS'}</span>
    </footer>
  )
}
