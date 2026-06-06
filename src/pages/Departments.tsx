import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import './Departments.css'

type Tone = 'good' | 'delay' | 'alert'

const DEPARTMENTS: { dept: string; head: string; status: Tone; active: number; hold: number }[] = [
  { dept: 'Design', head: 'Aashish', status: 'good', active: 8, hold: 0 },
  { dept: 'Purchase', head: 'Vikram', status: 'good', active: 2, hold: 1 },
  { dept: 'Laser / Cutting', head: 'Javed', status: 'delay', active: 4, hold: 1 },
  { dept: 'MS Production', head: 'Nilesh', status: 'good', active: 6, hold: 0 },
  { dept: 'Alloy Production', head: 'Manoj', status: 'good', active: 3, hold: 0 },
  { dept: 'CNC / VMC', head: 'Pratik', status: 'alert', active: 2, hold: 2 },
  { dept: 'MNTR', head: 'Deepak', status: 'good', active: 5, hold: 0 },
  { dept: 'Powder Coat', head: 'Sachin', status: 'good', active: 1, hold: 0 },
  { dept: 'QC', head: 'Ramesh', status: 'good', active: 3, hold: 0 },
  { dept: 'FG Stock', head: 'Anand', status: 'good', active: 7, hold: 0 },
  { dept: 'Maintenance', head: 'Suresh', status: 'good', active: 2, hold: 0 },
]

export default function Departments({
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
          <button className="screen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="screen__titles">
            <h1 className="screen__title display">Departments</h1>
            <span className="mono-label">Manage. Teams. Roles.</span>
          </div>
        </header>

        <div className="screen__scroll">
          <div className="deptgrid">
            {DEPARTMENTS.map((d) => (
              <button key={d.dept} className="deptcard">
                <span className="deptcard__top">
                  <span className="deptcard__name display">{d.dept}</span>
                  <span className={`chip chip--${d.status}`}>{d.status.toUpperCase()}</span>
                </span>
                <span className="deptcard__head mono-label">Head · {d.head}</span>
                <span className="deptcard__metrics">
                  <span className="metric">
                    <span className="metric__v display">{String(d.active).padStart(2, '0')}</span>
                    <span className="metric__k mono-label">Active</span>
                  </span>
                  <span className="metric">
                    <span className={`metric__v display ${d.hold ? 'is-warning' : ''}`}>
                      {String(d.hold).padStart(2, '0')}
                    </span>
                    <span className="metric__k mono-label">On Hold</span>
                  </span>
                  <span className="deptcard__arrow">→</span>
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
