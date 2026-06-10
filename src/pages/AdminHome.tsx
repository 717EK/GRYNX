import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import type { Screen } from '../App'
import './AdminHome.css'

interface NavItem {
  title: string
  sub: string
  badge: string
  to?: Screen
}

const NAV: NavItem[] = [
  { title: 'Create Job', sub: 'New Job Initiation', badge: '02', to: 'jobhub' },
  { title: 'Job Status', sub: 'Track. Monitor. Update.', badge: '03', to: 'jobstatus' },
  { title: 'Departments', sub: 'Manage. Teams. Roles.', badge: '01', to: 'departments' },
  { title: 'Approvals', sub: 'Approve. Account. Requests.', badge: '•', to: 'approvals' },
  { title: 'Maintenance', sub: 'Maintain. Repair. Optimize.', badge: '01', to: 'maintenance' },
]

interface Stat {
  k: string
  v: string
  tone?: 'default' | 'warning'
}

const STATS: Stat[] = [
  { k: 'Total Jobs', v: '1287' },
  { k: 'In Progress', v: '342' },
  { k: 'Completed', v: '945' },
  { k: 'Alerts', v: '07', tone: 'warning' },
]

export default function AdminHome({
  user,
  onLock,
  onOpenOverview,
  onNavigate,
  onScan,
}: {
  user: SessionUser
  onLock: () => void
  onOpenOverview: () => void
  onNavigate: (s: Screen) => void
  onScan: () => void
}) {
  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body admin">
        <nav className="admin__nav">
          {NAV.map((item) => (
            <button
              key={item.title}
              className="navrow"
              onClick={() => item.to && onNavigate(item.to)}
            >
              <span className="navrow__body">
                <span className="navrow__tick" />
                <span className="navrow__title display">{item.title}</span>
                <span className="navrow__sub mono-label">{item.sub}</span>
              </span>
              <span className="navrow__badge">[{item.badge}]</span>
              <span className="navrow__arrow">→</span>
            </button>
          ))}
        </nav>

        <button
          className="admin__stats"
          onClick={onOpenOverview}
          title="Open Admin Overview"
        >
          {STATS.map((s) => (
            <span key={s.k} className="stat">
              <span className="stat__k mono-label">{s.k}</span>
              <span className={`stat__v display ${s.tone === 'warning' ? 'is-warning' : ''}`}>
                {s.v}
              </span>
            </span>
          ))}
        </button>
      </main>
      <BottomBar onScan={onScan} />
    </div>
  )
}
