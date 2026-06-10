import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { useClock } from '../lib/useClock'
import { getAdminStats, type AdminStats } from '../lib/api'
import './AdminOverview.css'

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved', in_production: 'In Production', in_qc: 'In QC', in_fg: 'In FG Stock',
  close_requested: 'Closure Req.', closed: 'Closed', cancelled: 'Cancelled', draft: 'Draft', pending_approval: 'Pending',
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function NodeIcon() {
  return (
    <svg className="node-ico" viewBox="0 0 16 16" width="16" height="16" aria-hidden>
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" />
      <line x1="5" y1="8" x2="11" y2="8" />
    </svg>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel__title">{title}</h2>
      <div className="panel__body">{children}</div>
    </section>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function AdminOverview({
  user,
  onBack,
  onLock,
  onOpenInsights,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenInsights: () => void
}) {
  const time = useClock()
  const [s, setS] = useState<AdminStats | null>(null)
  useEffect(() => {
    const tick = () => getAdminStats().then(setS).catch(() => {})
    tick()
    const h = setInterval(tick, 30_000)
    return () => clearInterval(h)
  }, [])

  const k = s?.kpis
  const kpis = [
    { k: 'Active Jobs', v: pad(k?.active ?? 0) },
    { k: 'Completed Today', v: pad(k?.completedToday ?? 0) },
    { k: 'Overdue', v: pad(k?.overdue ?? 0), tone: (k?.overdue ?? 0) > 0 ? ('warning' as const) : undefined },
    { k: 'Open Tickets', v: pad(k?.openTickets ?? 0), tone: (k?.openTickets ?? 0) > 0 ? ('warning' as const) : undefined },
  ]
  const totals = [
    { k: 'Total Jobs', v: String(k?.totalJobs ?? 0) },
    { k: 'Active', v: String(k?.active ?? 0) },
    { k: 'Closed', v: String(k?.closed ?? 0) },
    { k: 'Units in WIP', v: String(k?.unitsWip ?? 0) },
  ]

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body overview">
        <header className="overview__head">
          <button className="overview__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="overview__titles">
            <h1 className="overview__title display">Admin Overview</h1>
            <span className="mono-label">{s ? 'Real-time glance over all operations' : 'Loading live data…'}</span>
          </div>
          <button className="overview__insights" onClick={onOpenInsights}>
            <span className="overview__insights-ico">✦</span>
            <span className="overview__insights-txt">
              <span className="mono-label">Intelligence</span>
              <span className="overview__time">{time}</span>
            </span>
          </button>
        </header>

        {/* KPI row */}
        <div className="kpis">
          {kpis.map((x) => (
            <div key={x.k} className="kpi">
              <span className="kpi__k mono-label">{x.k}</span>
              <span className={`kpi__v display ${x.tone === 'warning' ? 'is-warning' : ''}`}>{x.v}</span>
            </div>
          ))}
        </div>

        {/* panel grid */}
        <div className="panels">
          <Panel title="Job Pipeline">
            {!s ? <Loading /> : s.byDepartment.length === 0 ? <Empty text="No jobs at any station." /> : s.byDepartment.map((r) => (
              <div key={r.code} className="row">
                <span className="row__lead"><NodeIcon />{r.department}</span>
                <span className="row__num display">{pad(r.count)}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Department Health">
            {!s ? <Loading /> : s.departmentHealth.length === 0 ? <Empty text="No departments configured." /> : s.departmentHealth.map((r) => (
              <div key={r.code} className="row">
                <span className="row__lead"><NodeIcon />{r.department}</span>
                <span className="row__right">
                  <span className="row__head mono-label">{r.load} active{r.overdue ? ` · ${r.overdue} late` : ''}</span>
                  <span className={`chip chip--${r.tone}`}>{r.tone.toUpperCase()}</span>
                </span>
              </div>
            ))}
          </Panel>

          <Panel title="Production Jobs Overview">
            {!s ? <Loading /> : s.byProduct.length === 0 ? <Empty text="No active production." /> : s.byProduct.map((r) => (
              <div key={r.code} className="row">
                <span className="row__lead row__lead--plain">{r.product}</span>
                <span className="row__num display">{pad(r.count)}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Status Mix">
            {!s ? <Loading /> : s.statusMix.length === 0 ? <Empty text="No jobs yet." /> : s.statusMix.map((r) => (
              <div key={r.status} className="row">
                <span className="row__lead row__lead--plain">{STATUS_LABEL[r.status] ?? r.status}</span>
                <span className="row__num display">{pad(r.count)}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Recent Activity">
            {!s ? <Loading /> : s.recentActivity.length === 0 ? <Empty text="No activity yet." /> : s.recentActivity.map((r) => (
              <div key={r.id} className="feed">
                <span className="feed__dot" />
                <span className="feed__text"><b>{r.label}</b> {r.text}</span>
                <span className="feed__time mono-label">{timeOf(r.at)}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Alerts & Attention">
            {!s ? <Loading /> : s.attention.length === 0 ? <Empty text="✓ Nothing needs attention." /> : s.attention.map((r) => (
              <button key={r.kind + r.id} className="alert">
                <span className="alert__icon">⚠</span>
                <span className="alert__label">{r.label}</span>
                <span className="alert__meta mono-label">[{r.sub}]</span>
                <span className="alert__arrow">→</span>
              </button>
            ))}
          </Panel>
        </div>

        {/* footer big stats */}
        <div className="overview__totals">
          {totals.map((x) => (
            <div key={x.k} className="total">
              <span className="total__k mono-label">{x.k}</span>
              <span className="total__v display">{x.v}</span>
            </div>
          ))}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}

function Loading() {
  return <div className="row"><span className="row__lead row__lead--plain mono-label" style={{ opacity: 0.5 }}>Loading…</span></div>
}
function Empty({ text }: { text: string }) {
  return <div className="row"><span className="row__lead row__lead--plain mono-label" style={{ opacity: 0.6 }}>{text}</span></div>
}
