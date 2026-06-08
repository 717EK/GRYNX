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
  onOpenDept,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenDept: () => void
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
          <div className="deptlegend">
            <span className="deptlegend__i"><span className="heat heat--good" />Good</span>
            <span className="deptlegend__i"><span className="heat heat--delay" />Delay</span>
            <span className="deptlegend__i"><span className="heat heat--alert" />Alert</span>
          </div>
        </header>

        <div className="screen__scroll">
          <div className="deptlist">
            {DEPARTMENTS.map((d) => (
              <button key={d.dept} className="deptrow" onClick={onOpenDept}>
                <span className={`heat heat--${d.status}`} title={d.status} />
                <span className="deptrow__name">
                  <span className="display">{d.dept}</span>
                  <span className="deptrow__head mono-label">· {d.head}</span>
                </span>
                <span className="deptrow__metrics">
                  <span className="metric">
                    <b className="display">{String(d.active).padStart(2, '0')}</b>
                    <span className="mono-label">Active</span>
                  </span>
                  <span className="metric">
                    <b className={`display ${d.hold ? 'is-warning' : ''}`}>{String(d.hold).padStart(2, '0')}</b>
                    <span className="mono-label">Hold</span>
                  </span>
                </span>
                <span className={`chip chip--${d.status}`}>{d.status.toUpperCase()}</span>
                <span className="deptrow__arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
