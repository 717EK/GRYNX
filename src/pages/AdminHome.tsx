import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getAdminStats, type AdminStats } from '../lib/api'
import type { Screen } from '../App'
import './AdminHome.css'

interface NavItem {
  title: string
  sub: string
  badgeKey: 'pendingPpc' | 'active' | 'overdue' | 'pendingUsers' | 'openTickets'
  to?: Screen
}

// badge = live count of items needing attention for that menu
const NAV: NavItem[] = [
  { title: 'Create Job', sub: 'New Job Initiation', badgeKey: 'pendingPpc', to: 'jobhub' },
  { title: 'Job Status', sub: 'Track. Monitor. Update.', badgeKey: 'active', to: 'jobstatus' },
  { title: 'Departments', sub: 'Manage. Teams. Roles.', badgeKey: 'overdue', to: 'departments' },
  { title: 'Users', sub: 'Accounts. Roles. PINs.', badgeKey: 'pendingUsers', to: 'approvals' },
  { title: 'Maintenance', sub: 'Maintain. Repair. Optimize.', badgeKey: 'openTickets', to: 'maintenance' },
]

interface Stat {
  k: string
  v: string
  tone?: 'default' | 'warning'
}

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
  // live stats (was placeholder) — real counts from the control-centre aggregate
  const [kpi, setKpi] = useState<AdminStats['kpis'] | null>(null)
  useEffect(() => {
    const tick = () => getAdminStats().then((r) => setKpi(r.kpis)).catch(() => {})
    tick()
    const h = setInterval(tick, 30_000)
    return () => clearInterval(h)
  }, [])
  const badge = (key: NavItem['badgeKey']) => (kpi ? (kpi[key] ?? 0) : null)
  const v = (n?: number) => (kpi ? String(n ?? 0) : '—')
  const STATS: Stat[] = [
    { k: 'Total Jobs', v: v(kpi?.totalJobs) },
    { k: 'In Progress', v: v(kpi?.active) },
    { k: 'Completed', v: v(kpi?.closed) },
    { k: 'Alerts', v: kpi ? String(kpi.openTickets).padStart(2, '0') : '—', tone: kpi && kpi.openTickets > 0 ? 'warning' : 'default' },
  ]
  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body admin">
        <nav className="admin__nav">
          {NAV.map((item) => {
            const n = badge(item.badgeKey)
            return (
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
                <span className={`navrow__badge ${n && n > 0 ? 'navrow__badge--on' : ''}`}>
                  [{n === null ? '··' : String(n).padStart(2, '0')}]
                </span>
                <span className="navrow__arrow">→</span>
              </button>
            )
          })}
        </nav>

        {/* stats bar (just above the footer): stats flank a centred SCAN button.
            Tapping the stats opens the admin panel; SCAN scans a job card. */}
        <div className="admin__statsbar">
          <button className="admin__stats" onClick={onOpenOverview} title="Open Admin Overview">
            {STATS.slice(0, 2).map((s) => (
              <span key={s.k} className="stat">
                <span className="stat__k mono-label">{s.k}</span>
                <span className={`stat__v display ${s.tone === 'warning' ? 'is-warning' : ''}`}>{s.v}</span>
              </span>
            ))}
          </button>
          <button className="admin__scanbtn" onClick={onScan} title="Scan a job card for its history" aria-label="Scan job card">
            <svg viewBox="0 0 48 48" width="24" height="24" fill="currentColor" aria-hidden>
              <path d="M4 4h14v14H4V4Zm3 3v8h8V7H7Zm2 2h4v4H9V9Z" />
              <path d="M30 4h14v14H30V4Zm3 3v8h8V7h-8Zm2 2h4v4h-4V9Z" />
              <path d="M4 30h14v14H4V30Zm3 3v8h8v-8H7Zm2 2h4v4H9v-4Z" />
              <path d="M22 4h4v4h-4V4Zm0 8h4v8h-8v-4h4v-4Zm-8 8h4v4h-4v-4Zm14 0h4v4h-4v-4Zm6 0h4v4h-4v-4ZM22 24h4v4h-4v-4Zm8 0h4v4h-4v-4Zm6 0h8v4h-4v4h-4v-8Zm-14 6h4v4h-4v-4Zm6 0h4v8h-4v-8Zm8 4h4v4h-4v-4Zm-4 6h4v4h-4v-4Zm8 0h4v4h-4v-4Z" />
            </svg>
            <span className="admin__scanbtn-label mono-label">SCAN</span>
          </button>
          <button className="admin__stats admin__stats--r" onClick={onOpenOverview} title="Open Admin Overview">
            {STATS.slice(2, 4).map((s) => (
              <span key={s.k} className="stat">
                <span className="stat__k mono-label">{s.k}</span>
                <span className={`stat__v display ${s.tone === 'warning' ? 'is-warning' : ''}`}>{s.v}</span>
              </span>
            ))}
          </button>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
