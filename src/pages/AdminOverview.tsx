import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { useClock } from '../lib/useClock'
import './AdminOverview.css'

type Tone = 'good' | 'delay' | 'alert'

const KPIS: { k: string; v: string; tone?: 'warning' }[] = [
  { k: 'Active Jobs', v: '23' },
  { k: 'Completed Today', v: '17' },
  { k: 'Delayed', v: '04', tone: 'warning' },
  { k: 'Alerts', v: '07', tone: 'warning' },
]

const PIPELINE: { dept: string; count: string }[] = [
  { dept: 'Design', count: '08' },
  { dept: 'Purchase', count: '02' },
  { dept: 'Laser / Cutting', count: '04' },
  { dept: 'MS Production', count: '06' },
  { dept: 'Alloy Production', count: '03' },
  { dept: 'CNC / VMC', count: '02' },
  { dept: 'MNTR', count: '05' },
  { dept: 'Powder Coat', count: '01' },
  { dept: 'FG Stock', count: '07' },
]

const HEALTH: { dept: string; head: string; tone: Tone }[] = [
  { dept: 'Design', head: 'Aashish', tone: 'good' },
  { dept: 'Purchase', head: 'Vikram', tone: 'good' },
  { dept: 'Laser / Cutting', head: 'Javed', tone: 'delay' },
  { dept: 'MS Production', head: 'Nilesh', tone: 'good' },
  { dept: 'Alloy Production', head: 'Manoj', tone: 'good' },
  { dept: 'CNC / VMC', head: 'Pratik', tone: 'alert' },
  { dept: 'MNTR', head: 'Deepak', tone: 'good' },
  { dept: 'Powder Coat', head: 'Sachin', tone: 'good' },
  { dept: 'FG Stock', head: 'Anand', tone: 'good' },
]

const PRODUCTS: { name: string; count: string }[] = [
  { name: 'Alloy Truss', count: '12' },
  { name: 'MS Truss', count: '08' },
  { name: 'Scaffoldings', count: '03' },
  { name: 'Stage', count: '07' },
  { name: 'Mojo Alloy/MS', count: '05' },
  { name: 'Lifter Alloy/MS', count: '02' },
  { name: 'Stacker', count: '04' },
]

const BOTTLENECKS: { label: string; meta: string }[] = [
  { label: 'Laser / Cutting', meta: '04 Waiting' },
  { label: 'CNC / VMC', meta: '03 Waiting' },
  { label: 'Powder Coat', meta: '02 Waiting' },
  { label: 'Purchase Approval', meta: '02 Pending' },
  { label: 'Design Drawings', meta: '03 Pending' },
]

const ACTIVITY: { entity: string; text: string; time: string }[] = [
  { entity: 'Alloy Truss', text: 'moved to CNC / VMC', time: '10:35 AM' },
  { entity: 'MS Truss', text: 'entered MS Production', time: '10:28 AM' },
  { entity: 'Stage', text: 'entered Powder Coat', time: '10:21 AM' },
  { entity: 'Purchase', text: 'approved material for JOB-250503', time: '10:15 AM' },
  { entity: 'FG Stock', text: 'dispatched JOB-250495', time: '10:08 AM' },
  { entity: 'CNC / VMC', text: 'completed JOB-250491', time: '10:02 AM' },
  { entity: 'Design', text: 'drawing approved for JOB-250504', time: '09:55 AM' },
  { entity: 'MNTR', text: 'completed JOB-250488', time: '09:48 AM' },
]

const ALERTS: { label: string; meta: string }[] = [
  { label: 'Drawings Pending Approval', meta: '03 Jobs' },
  { label: 'Purchase Approvals Pending', meta: '02 Jobs' },
  { label: 'CNC / VMC Machine Maintenance Due', meta: '01 Machine' },
  { label: 'FG Stock Shortage', meta: '01 Item' },
]

const FOOTER_STATS: { k: string; v: string; tone?: 'warning' }[] = [
  { k: 'Total Jobs', v: '1287' },
  { k: 'Active', v: '342' },
  { k: 'Completed', v: '945' },
  { k: 'Alerts', v: '07', tone: 'warning' },
]

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

export default function AdminOverview({
  user,
  onBack,
  onLock,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
}) {
  const time = useClock()
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
            <span className="mono-label">Real-time glance over all operations</span>
          </div>
          <div className="overview__updated">
            <span className="mono-label">Last Updated</span>
            <span className="overview__time">{time}</span>
          </div>
        </header>

        {/* KPI row */}
        <div className="kpis">
          {KPIS.map((s) => (
            <div key={s.k} className="kpi">
              <span className="kpi__k mono-label">{s.k}</span>
              <span className={`kpi__v display ${s.tone === 'warning' ? 'is-warning' : ''}`}>
                {s.v}
              </span>
            </div>
          ))}
        </div>

        {/* panel grid */}
        <div className="panels">
          <Panel title="Job Pipeline">
            {PIPELINE.map((r) => (
              <div key={r.dept} className="row">
                <span className="row__lead">
                  <NodeIcon />
                  {r.dept}
                </span>
                <span className="row__num display">{r.count}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Department Health">
            {HEALTH.map((r) => (
              <div key={r.dept} className="row">
                <span className="row__lead">
                  <NodeIcon />
                  {r.dept}
                </span>
                <span className="row__right">
                  <span className="row__head mono-label">{r.head}</span>
                  <span className={`chip chip--${r.tone}`}>{r.tone.toUpperCase()}</span>
                </span>
              </div>
            ))}
          </Panel>

          <Panel title="Production Jobs Overview">
            {PRODUCTS.map((r) => (
              <div key={r.name} className="row">
                <span className="row__lead row__lead--plain">{r.name}</span>
                <span className="row__num display">{r.count}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Bottlenecks">
            {BOTTLENECKS.map((r) => (
              <div key={r.label} className="row">
                <span className="row__lead row__lead--plain">{r.label}</span>
                <span className="row__meta mono-label">{r.meta}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Recent Activity">
            {ACTIVITY.map((r, i) => (
              <div key={i} className="feed">
                <span className="feed__dot" />
                <span className="feed__text">
                  <b>{r.entity}</b> {r.text}
                </span>
                <span className="feed__time mono-label">{r.time}</span>
              </div>
            ))}
          </Panel>

          <Panel title="Alerts & Attention">
            {ALERTS.map((r) => (
              <button key={r.label} className="alert">
                <span className="alert__icon">⚠</span>
                <span className="alert__label">{r.label}</span>
                <span className="alert__meta mono-label">[{r.meta}]</span>
                <span className="alert__arrow">→</span>
              </button>
            ))}
          </Panel>
        </div>

        {/* footer big stats */}
        <div className="overview__totals">
          {FOOTER_STATS.map((s) => (
            <div key={s.k} className="total">
              <span className="total__k mono-label">{s.k}</span>
              <span className={`total__v display ${s.tone === 'warning' ? 'is-warning' : ''}`}>
                {s.v}
              </span>
            </div>
          ))}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
