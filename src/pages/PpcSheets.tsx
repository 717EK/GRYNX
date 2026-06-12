import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getSaleSheets, type SaleSheet } from '../lib/api'
import './DeptHome.css'
import './Maintenance.css'

// PPC picks a submitted Sale Sheet to convert into a PPC request — the pick
// pre-fills the request form (order name) and links the sheet (saleSheetId),
// which the backend marks `converted` on submit.
export default function PpcSheets({
  user,
  onBack,
  onLock,
  onPick,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onPick: (sheet: SaleSheet) => void
}) {
  const [sheets, setSheets] = useState<SaleSheet[] | null>(null)

  useEffect(() => {
    getSaleSheets('submitted').then((r) => setSheets(r.sheets)).catch(() => setSheets([]))
  }, [])

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : null)

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Sale Sheets</h1>
            <span className="mono-label">{sheets ? `${sheets.length} from sales, awaiting conversion` : 'Loading…'}</span>
          </div>
          <span />
        </header>
        <div className="screen__scroll">
          {sheets === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : sheets.length === 0 ? (
            <span className="dh__empty mono-label">No sale sheets waiting — sales hasn’t submitted any.</span>
          ) : (
            <ul className="dh__list">
              {sheets.map((s) => (
                <li key={s.id}>
                  <button className="dh__row" onClick={() => onPick(s)}>
                    <span className="dh__main">
                      <span className="dh__label display">{s.orderName || s.customer}</span>
                      <span className="dh__meta mono-label">
                        {s.sheetNo} · {s.customer}{s.targetDate ? ` · target ${fmt(s.targetDate)}` : ''}
                        {s.details ? ` · ${s.details.slice(0, 60)}${s.details.length > 60 ? '…' : ''}` : ''}
                      </span>
                    </span>
                    <span className="dh__right">
                      <span className="dh__tag dh__tag--info mono-label">CONVERT →</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
