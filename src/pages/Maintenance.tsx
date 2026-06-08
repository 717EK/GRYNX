import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './Maintenance.css'

type Pri = 'critical' | 'high' | 'normal' | 'low'
type Status = 'open' | 'assigned' | 'in_progress' | 'completed'

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
}

const TICKETS: {
  id: string
  category: string
  pri: Pri
  status: Status
  location: string
  assignee: string
}[] = [
  { id: 'MT-0007', category: 'Mechanical', pri: 'critical', status: 'in_progress', location: 'CNC #3 — Spindle', assignee: 'Suresh' },
  { id: 'MT-0006', category: 'Electrical', pri: 'high', status: 'assigned', location: 'Powder Coat Oven', assignee: 'Rakesh' },
  { id: 'MT-0005', category: 'Utility', pri: 'normal', status: 'open', location: 'Air Compressor 2', assignee: '—' },
  { id: 'MT-0004', category: 'Facility', pri: 'low', status: 'completed', location: 'Office AC Unit', assignee: 'Rakesh' },
  { id: 'MT-0003', category: 'IT / Network', pri: 'normal', status: 'open', location: 'FG Stock Scanner', assignee: '—' },
  { id: 'MT-0002', category: 'Mechanical', pri: 'high', status: 'in_progress', location: 'Laser Bed Rail', assignee: 'Suresh' },
]

const SUMMARY = [
  { k: 'Open', v: '02' },
  { k: 'In Progress', v: '02', tone: 'warning' as const },
  { k: 'Assigned', v: '01' },
  { k: 'Completed Today', v: '03' },
]

export default function Maintenance({
  user,
  onBack,
  onLock,
  onOpenTicket,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenTicket: () => void
}) {
  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="screen__titles">
            <h1 className="screen__title display">Maintenance</h1>
            <span className="mono-label">Maintain. Repair. Optimize.</span>
          </div>
          <button className="mnt__report btn btn--solid">+ Report</button>
        </header>

        <div className="screen__scroll">
          <div className="mnt__summary">
            {SUMMARY.map((s) => (
              <div key={s.k} className="mnt__stat">
                <span className={`mnt__stat-v display ${s.tone === 'warning' ? 'is-warning' : ''}`}>
                  {s.v}
                </span>
                <span className="mnt__stat-k mono-label">{s.k}</span>
              </div>
            ))}
          </div>

          <div className="mnt__list">
            {TICKETS.map((t) => (
              <button key={t.id} className="ticket" onClick={onOpenTicket}>
                <span className="ticket__lead">
                  <span className={`pri pri--${t.pri}`} />
                  <span className="ticket__main">
                    <span className="ticket__loc">{t.location}</span>
                    <span className="ticket__meta mono-label">
                      {t.id} · {t.category} · {t.assignee}
                    </span>
                  </span>
                </span>
                <span className="ticket__right">
                  <span className={`pri-tag pri-tag--${t.pri} mono-label`}>{t.pri}</span>
                  <span className={`status status--${t.status} mono-label`}>
                    <span className="status__dot" />
                    {STATUS_LABEL[t.status]}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
