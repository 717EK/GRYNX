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

      {/* hovering scan button — admin scans any job card to pull its full history */}
      <button className="admin__scanfab" onClick={onScan} title="Scan a job card for its history" aria-label="Scan job card">
        <svg viewBox="0 0 48 48" width="30" height="30" fill="currentColor" aria-hidden>
          <path d="M4 4h14v14H4V4Zm3 3v8h8V7H7Zm2 2h4v4H9V9Z" />
          <path d="M30 4h14v14H30V4Zm3 3v8h8V7h-8Zm2 2h4v4h-4V9Z" />
          <path d="M4 30h14v14H4V30Zm3 3v8h8v-8H7Zm2 2h4v4H9v-4Z" />
          <path d="M22 4h4v4h-4V4Zm0 8h4v8h-8v-4h4v-4Zm-8 8h4v4h-4v-4Zm14 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM22 24h4v4h-4v-4Zm8 0h4v4h-4v-4Zm6 0h8v4h-4v4h-4v-8Zm-14 6h4v4h-4v-4Zm6 0h4v8h-4v-8Zm8 4h4v4h-4v-4Zm-4 6h4v4h-4v-4Zm8 0h4v4h-4v-4Z" />
        </svg>
      </button>
      <BottomBar fabNotch />
    </div>
  )
}
