import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getAdminStats, type DeptHealth } from '../lib/api'
import './Departments.css'

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
  const [rows, setRows] = useState<DeptHealth[] | null>(null)
  useEffect(() => {
    const tick = () => getAdminStats().then((s) => setRows(s.departmentHealth)).catch(() => setRows([]))
    tick()
    const h = setInterval(tick, 30_000)
    return () => clearInterval(h)
  }, [])

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
            <span className="mono-label">Live floor load &amp; health</span>
          </div>
          <div className="deptlegend">
            <span className="deptlegend__i"><span className="heat heat--good" />Good</span>
            <span className="deptlegend__i"><span className="heat heat--delay" />Delay</span>
            <span className="deptlegend__i"><span className="heat heat--alert" />Alert</span>
          </div>
        </header>

        <div className="screen__scroll">
          <div className="deptlist">
            {rows === null ? (
              <span className="dh__empty mono-label" style={{ padding: 16, display: 'block' }}>Loading…</span>
            ) : rows.length === 0 ? (
              <span className="dh__empty mono-label" style={{ padding: 16, display: 'block' }}>No departments configured.</span>
            ) : rows.map((d) => (
              <button key={d.code} className="deptrow" onClick={onOpenDept}>
                <span className={`heat heat--${d.tone}`} title={d.tone} />
                <span className="deptrow__name">
                  <span className="display">{d.department}</span>
                  <span className="deptrow__head mono-label">· {d.code}{d.overdue ? ` · ${d.overdue} late` : ''}</span>
                </span>
                <span className="deptrow__metrics">
                  <span className="metric">
                    <b className="display">{String(d.load).padStart(2, '0')}</b>
                    <span className="mono-label">Active</span>
                  </span>
                  <span className="metric">
                    <b className={`display ${d.onHold ? 'is-warning' : ''}`}>{String(d.onHold).padStart(2, '0')}</b>
                    <span className="mono-label">Hold</span>
                  </span>
                </span>
                <span className={`chip chip--${d.tone}`}>{d.tone.toUpperCase()}</span>
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
