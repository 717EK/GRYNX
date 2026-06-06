import { useClock, useUptime } from '../lib/useClock'

export interface SessionUser {
  name: string
  role: string
  id: string
}

const APP_VERSION = 'v0.1.0'

function Brand({ showGrynx }: { showGrynx?: boolean }) {
  return (
    <div className="ubar__left">
      <span className="logo-dlyft">
        <span className="accent">D-</span>LYFT
      </span>
      {showGrynx && (
        <>
          <span className="vrule" />
          <span className="logo-grynx">GRYNX</span>
        </>
      )}
    </div>
  )
}

function StatusSegments() {
  const time = useClock()
  return (
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
  return (
    <header className="ubar ubar--top">
      <Brand showGrynx={!!user} />
      <StatusSegments />
      <div className="ubar__right">
        {user && (
          <>
            <div className="userid">
              <span className="userid__name">{user.name}</span>
              <span className="userid__sub">{user.role} · ID {user.id}</span>
            </div>
            <button className="iconbtn" title="Lock / sign out" onClick={onLock}>
              ⏻
            </button>
          </>
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
