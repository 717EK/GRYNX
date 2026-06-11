import { useEffect, useMemo, useState } from 'react'
import { getCalendar, type CalendarData } from '../lib/api'

const WD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')
const todayKey = new Date().toISOString().slice(0, 10)

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export default function CalendarWidget({ onOpenJob }: { onOpenJob: (id: string) => void }) {
  const [month, setMonth] = useState(() => todayKey.slice(0, 7))
  const [data, setData] = useState<CalendarData | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  useEffect(() => {
    getCalendar(month).then(setData).catch(() => setData({ month, days: {} }))
  }, [month])

  const [y, m] = month.split('-').map(Number)
  // Monday-based leading blanks + day count
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const days = data?.days ?? {}

  // default selection: today if in view, else the first day with events
  useEffect(() => {
    if (!data) return
    if (todayKey.startsWith(month)) setSel(todayKey)
    else { const first = Object.keys(data.days).sort()[0]; setSel(first ?? null) }
  }, [data, month])

  const selDay = sel ? days[sel] : undefined
  const selLabel = useMemo(() => {
    if (!sel) return ''
    const d = Number(sel.slice(8))
    return sel === todayKey ? 'Today' : `${MONTHS[m - 1].slice(0, 3)} ${d}`
  }, [sel, m])

  return (
    <div className="dwcal">
      <div className="dwcal__top">
        <span className="dwcal__m">{MONTHS[m - 1]} {y}</span>
        <span className="dwcal__nav">
          <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">‹</button>
          <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">›</button>
        </span>
      </div>

      <div className="dwcal__grid">
        {WD.map((d) => <div key={d} className="dwcal__h">{d}</div>)}
        {Array.from({ length: lead }).map((_, i) => <div key={'b' + i} className="dwcal__d empty" />)}
        {Array.from({ length: dim }).map((_, i) => {
          const day = i + 1
          const key = `${y}-${pad(m)}-${pad(day)}`
          const info = days[key]
          return (
            <button
              key={key}
              className={`dwcal__d ${key === todayKey ? 'today' : ''} ${sel === key ? 'sel' : ''}`}
              onClick={() => setSel(key)}
            >
              {day}
              {info && (info.active || info.closed) && (
                <span className="dots">
                  {info.active > 0 && <i className="a" />}
                  {info.closed > 0 && <i className="c" />}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="dwcal__leg">
        <span><i style={{ background: '#84cc16' }} />Today</span>
        <span><i style={{ background: '#84cc16' }} />Active</span>
        <span><i style={{ background: '#5ec2b8' }} />Closed</span>
      </div>

      <div className="dwcal__list">
        {!selDay || selDay.jobs.length === 0 ? (
          <span className="dwcal__day" style={{ color: '#8a8474' }}>{sel ? `${selLabel} — nothing scheduled` : 'Pick a day'}</span>
        ) : (
          <>
            <span className="dwcal__day">{selLabel} · {selDay.active} active · {selDay.closed} closed</span>
            {selDay.jobs.map((j) => (
              <button key={j.id + j.kind} className="dwcal__evt" onClick={() => onOpenJob(j.id)} title={j.label}>
                <span className={`pip ${j.kind === 'active' ? 'a' : 'c'}`} />
                <span>{j.label}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
