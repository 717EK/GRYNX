import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './Notifications.css'

type NType = 'new_job' | 'update_request' | 'hold_alert' | 'ppc_approval' | 'maintenance' | 'closure' | 'escalation'

const ICON: Record<NType, string> = {
  new_job: '＋',
  update_request: '↻',
  hold_alert: '‖',
  ppc_approval: '✓',
  maintenance: '⚙',
  closure: '◳',
  escalation: '⚠',
}

interface Notif {
  type: NType
  title: string
  body: string
  at: string
  unread: boolean
}

const TODAY: Notif[] = [
  { type: 'escalation', title: 'Job escalated to Admin', body: 'ST-N-012 unaccepted for 24h — Powder Coat', at: '14m ago', unread: true },
  { type: 'ppc_approval', title: 'PPC request awaiting approval', body: 'PR-0002 · Alloy Truss · 45 units', at: '1h ago', unread: true },
  { type: 'hold_alert', title: 'Job placed on hold', body: 'CNC / VMC — Machine Breakdown', at: '2h ago', unread: true },
  { type: 'closure', title: 'Closure requested', body: 'AT-U-040-040626-001 · FG Stock', at: '3h ago', unread: false },
]

const EARLIER: Notif[] = [
  { type: 'new_job', title: 'New job assigned', body: 'MT-N-030 reached MS Production', at: 'Yesterday', unread: false },
  { type: 'update_request', title: 'Update requested', body: 'Admin requested an update on AT-U-045', at: 'Yesterday', unread: false },
  { type: 'maintenance', title: 'Maintenance completed', body: 'MT-0004 · Office AC Unit', at: '2 days ago', unread: false },
]

function List({ title, items }: { title: string; items: Notif[] }) {
  return (
    <section className="nsec">
      <span className="nsec__title mono-label">{title}</span>
      <div className="nlist">
        {items.map((n, i) => (
          <button key={i} className={`notif ${n.unread ? 'is-unread' : ''}`}>
            <span className={`notif__icon notif__icon--${n.type}`}>{ICON[n.type]}</span>
            <span className="notif__body">
              <span className="notif__title">{n.title}</span>
              <span className="notif__text mono-label">{n.body}</span>
            </span>
            <span className="notif__at mono-label">{n.at}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function Notifications({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Notifications</h1>
            <span className="mono-label">3 Unread</span>
          </div>
          <button className="notif__readall mono-label">Mark all read</button>
        </header>
        <div className="screen__scroll">
          <List title="Today" items={TODAY} />
          <List title="Earlier" items={EARLIER} />
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
