import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getSaleSheets, createSaleSheet, type SaleSheet } from '../lib/api'
import ReportButton from '../components/ReportButton'
import './DeptHome.css'
import './Maintenance.css'

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', submitted: 'With PPC', converted: 'Converted', cancelled: 'Cancelled' }

export default function SalesHome({ user, onLock }: { user: SessionUser; onLock: () => void }) {
  const [sheets, setSheets] = useState<SaleSheet[] | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    try { setSheets((await getSaleSheets()).sheets) } catch { setSheets([]) }
  }
  useEffect(() => { void load() }, [])

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <span />
          <div className="screen__titles">
            <h1 className="screen__title display">Sales Desk</h1>
            <span className="mono-label">{sheets ? `${sheets.length} sale sheets` : 'Loading…'}</span>
          </div>
          <ReportButton />
        </header>
        <div className="screen__scroll">
          <button className="btn btn--solid btn--block" style={{ marginBottom: 12 }} onClick={() => setCreating(true)}>+ New Sale Sheet</button>
          {sheets === null ? (
            <span className="dh__empty mono-label">Loading…</span>
          ) : sheets.length === 0 ? (
            <span className="dh__empty mono-label">No sale sheets yet — raise one to hand to PPC.</span>
          ) : (
            <ul className="dh__list">
              {sheets.map((s) => (
                <li key={s.id}>
                  <div className="dh__row">
                    <span className="dh__main">
                      <span className="dh__label display">{s.orderName || s.customer}</span>
                      <span className="dh__meta mono-label">{s.sheetNo} · {s.customer}{s.request ? ` · → ${s.request.requestNo}` : ''}</span>
                    </span>
                    <span className="dh__right">
                      <span className={`dh__tag mono-label dh__tag--${s.status === 'converted' ? 'info' : s.status === 'submitted' ? 'urgent' : 'info'}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <BottomBar />
      {creating && <SheetModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load() }} />}
    </div>
  )
}

function SheetModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [customer, setCustomer] = useState('')
  const [orderName, setOrderName] = useState('')
  const [details, setDetails] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(asSubmit: boolean) {
    if (!customer.trim()) { setErr('Customer name is required'); return }
    setBusy(true); setErr(null)
    try {
      await createSaleSheet({
        customer: customer.trim(),
        orderName: orderName.trim() || undefined,
        details: details.trim() || undefined,
        targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
        submit: asSubmit,
      })
      onDone()
    } catch { setErr('Could not save — try again'); setBusy(false) }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">New Sale Sheet</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <label className="mnt__field">
          <span className="mono-label">Customer / vendor *</span>
          <input className="mnt__input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Emaar Events" />
        </label>
        <label className="mnt__field">
          <span className="mono-label">Order name</span>
          <input className="mnt__input" value={orderName} onChange={(e) => setOrderName(e.target.value)} placeholder="e.g. Dubai order — 1600 sqft stage" />
        </label>
        <label className="mnt__field">
          <span className="mono-label">Scope / details</span>
          <textarea className="mnt__textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What the customer ordered…" />
        </label>
        <label className="mnt__field">
          <span className="mono-label">Target date</span>
          <input className="mnt__input" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
        {err && <span className="mnt__err mono-label">{err}</span>}
        <div className="dh__modal-actions">
          <button className="btn btn--ghost" disabled={busy} onClick={() => submit(false)}>Save draft</button>
          <button className="btn btn--solid" disabled={busy} onClick={() => submit(true)}>{busy ? '…' : 'Submit → PPC'}</button>
        </div>
      </div>
    </div>
  )
}
