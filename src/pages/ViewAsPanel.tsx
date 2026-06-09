import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import type { Screen } from '../App'
import { getDepartments, type DeptLite } from '../lib/api'
import './ViewAsPanel.css'

// SuperUser (Administrator) landing: preview/operate every department's home.
// AASHISH (real admin) lands on the admin home instead.
export default function ViewAsPanel({
  user,
  onLock,
  onViewStation,
  onNavigate,
}: {
  user: SessionUser
  onLock: () => void
  onViewStation: (dept: { id: string; name: string }) => void
  onNavigate: (s: Screen) => void
}) {
  const [depts, setDepts] = useState<DeptLite[]>([])
  useEffect(() => {
    getDepartments()
      .then((d) => setDepts(d.departments))
      .catch(() => setDepts([]))
  }, [])

  // departments that have their own dedicated screen (not the station template)
  const special: Record<string, Screen> = { MAINT: 'maintenance' }

  const roleViews: { label: string; sub: string; to: Screen }[] = [
    { label: 'Admin Home', sub: 'AASHISH · full control', to: 'home' },
    { label: 'Create Job', sub: 'admin / PPC', to: 'create' },
    { label: 'Maintenance', sub: 'tickets', to: 'maintenance' },
  ]

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body va">
        <header className="va__head">
          <span className="mono-label va__kicker">SUPERUSER · VIEW AS</span>
          <h1 className="va__title display">Department Views</h1>
          <span className="mono-label va__sub">Open any station to test it as that user</span>
        </header>

        <div className="va__scroll">
          <span className="va__group mono-label">Role views</span>
          <div className="va__grid">
            {roleViews.map((r) => (
              <button key={r.label} className="va__card va__card--role" onClick={() => onNavigate(r.to)}>
                <span className="va__card-title display">{r.label}</span>
                <span className="va__card-sub mono-label">{r.sub}</span>
              </button>
            ))}
          </div>

          <span className="va__group mono-label">Stations / departments</span>
          <div className="va__grid">
            {depts.map((d) => (
              <button
                key={d.id}
                className="va__card"
                onClick={() => (special[d.code] ? onNavigate(special[d.code]) : onViewStation({ id: d.id, name: d.name }))}
              >
                <span className="va__card-title display">{d.name}</span>
                <span className="va__card-sub mono-label">{d.code}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
