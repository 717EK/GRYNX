import { useClock, useUptime } from '../lib/useClock'
import ThemePicker from './ThemePicker'
import grynxWordmark from '../assets/grynx-wordmark.png'
import dlyftWordmark from '../assets/dlyft-wordmark.png'
import dlyftWordmarkLight from '../assets/dlyft-wordmark-light.png'

export interface SessionUser {
  name: string
  role: string
  id: string
}

const APP_VERSION = 'v0.1.0'

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
}: {
  user?: SessionUser
  onLock?: () => void
}) {
  const time = useClock()
  return (
    <header className="ubar ubar--top">
      <Brand inApp={!!user} />

      {/* full segments (tablet/desktop) */}
      <div className="ubar__mid">
        <Seg k="SYSTEM" v="ONLINE" />
        <Seg k="SYNC" v={time} />
        <Seg k="STATUS" v="OPERATIONAL" />
        <Seg
          k="NET"
          v={
            <>
              SECURE <span className="lock">🔒</span>
            </>
          }
        />
      </div>

      {/* compact status (mobile) */}
      <div className="ubar__status-mobile">
        <span className="status-dot" />
        OPERATIONAL
      </div>

      <div className="ubar__right">
        {user && (
          <div className="userid">
            <span className="userid__name">{user.name}</span>
            <span className="userid__sub">{user.role} · ID {user.id}</span>
          </div>
        )}
        <ThemePicker />
        {user && (
          <button className="iconbtn" title="Lock / sign out" onClick={onLock}>
            ⏻
          </button>
        )}
      </div>
    </header>
  )
}

export function BottomBar() {
  const uptime = useUptime()
  return (
    <footer className="ubar ubar--bottom">
      <span>GRYNX {APP_VERSION}</span>
      <span className="ubar--bottom__mid">UPTIME {uptime}</span>
      <span>DATA ENCRYPTED AES-256</span>
    </footer>
  )
}
