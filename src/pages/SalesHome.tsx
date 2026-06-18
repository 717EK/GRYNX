import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getSaleSheets, createSaleSheet, getOrders, createOrder, type SaleSheet, type Order, type OrderInput } from '../lib/api'
import { useCatalogue } from '../lib/useCatalogue'
import ReportButton from '../components/ReportButton'
import './DeptHome.css'
import './Maintenance.css'

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', submitted: 'With PPC', converted: 'Converted', cancelled: 'Cancelled' }
const ORDER_STATUS: Record<string, string> = { draft: 'Draft', submitted: 'With PPC', planning: 'PPC planning', in_production: 'In production', ready: 'Ready', dispatched: 'Dispatched', closed: 'Closed', cancelled: 'Cancelled' }

export default function SalesHome({ user, onLock }: { user: SessionUser; onLock: () => void }) {
  const [sheets, setSheets] = useState<SaleSheet[] | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [ordering, setOrdering] = useState(false)

  async function load() {
    try { setSheets((await getSaleSheets()).sheets) } catch { setSheets([]) }
    getOrders().then((r) => setOrders(r.orders)).catch(() => setOrders([]))
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
          <div className="ppc__quick">
            <button className="btn btn--solid" style={{ flex: 2 }} onClick={() => setOrdering(true)}>＋ New Order</button>
            <button className="btn btn--ghost" style={{ flex: 1 }} onClick={() => setCreating(true)}>＋ Quick sheet</button>
          </div>

          <section className="jsec">
            <h2 className="jsec__title mono-label">Orders <span className="jsec__count">{orders?.length ?? 0}</span></h2>
            {orders === null ? <span className="dh__empty mono-label">Loading…</span> : orders.length === 0 ? (
              <span className="dh__empty mono-label">No orders yet — raise one for PPC to plan.</span>
            ) : (
              <ul className="dh__list">
                {orders.map((o) => (
                  <li key={o.id}>
                    <div className="dh__row">
                      <span className="dh__main">
                        <span className="dh__label display">{o.name || o.orderNo}</span>
                        <span className="dh__meta mono-label">{o.orderNo} · {o.client} · {o.items.length} line{o.items.length > 1 ? 's' : ''}</span>
                      </span>
                      <span className="dh__right">
                        <span className="dh__tag dh__tag--info mono-label">{ORDER_STATUS[o.derivedStatus] ?? o.derivedStatus}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(sheets?.length ?? 0) > 0 && (
            <section className="jsec">
              <h2 className="jsec__title mono-label">Quick sheets <span className="jsec__count">{sheets!.length}</span></h2>
              <ul className="dh__list">
                {sheets!.map((s) => (
                  <li key={s.id}>
                    <div className="dh__row">
                      <span className="dh__main">
                        <span className="dh__label display">{s.orderName || s.customer}</span>
                        <span className="dh__meta mono-label">{s.sheetNo} · {s.customer}{s.request ? ` · → ${s.request.requestNo}` : ''}</span>
                      </span>
                      <span className="dh__right">
                        <span className={`dh__tag mono-label dh__tag--${s.status === 'submitted' ? 'urgent' : 'info'}`}>{STATUS_LABEL[s.status] ?? s.status}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <BottomBar />
      {creating && <SheetModal onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load() }} />}
      {ordering && <OrderModal onClose={() => setOrdering(false)} onDone={() => { setOrdering(false); void load() }} />}
    </div>
  )
}

// Structured Sales order (line items) — the order-centric intake (docs/12).
function OrderModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { catalogue } = useCatalogue()
  const products = catalogue ?? []
  const [client, setClient] = useState('')
  const [name, setName] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [rows, setRows] = useState<{ productId: string; modelId: string; quantity: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const addRow = () => setRows((r) => [...r, { productId: products[0]?.id ?? '', modelId: '', quantity: 1 }])
  const setRow = (i: number, p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const modelsFor = (pid: string) => products.find((p) => p.id === pid)?.models ?? []

  async function submit() {
    setErr(null)
    if (!client.trim()) return setErr('Customer is required')
    const items = rows.filter((r) => r.productId && r.quantity > 0).map((r) => ({ productId: r.productId, modelId: r.modelId || undefined, quantity: r.quantity }))
    if (items.length === 0) return setErr('Add at least one item')
    setBusy(true)
    try { await createOrder({ client: client.trim(), name: name.trim() || undefined, priority, submit: true, items } as OrderInput); onDone() } catch { setErr('Could not submit'); setBusy(false) }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">New Order</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        <label className="mnt__field"><span className="mono-label">Customer *</span><input className="mnt__input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Emaar Events" /></label>
        <label className="mnt__field"><span className="mono-label">Order name</span><input className="mnt__input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SS 60x40 Truss — Dubai" /></label>
        <label className="mnt__field"><span className="mono-label">Priority</span>
          <select className="mnt__input" value={priority} onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}><option value="normal">Normal</option><option value="urgent">Urgent</option></select>
        </label>
        <div className="mnt__field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="mono-label">Items</span>
            <button className="btn btn--ghost ppc__sm" onClick={addRow}>＋ Add</button>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="ppc__orow">
              <select className="mnt__input" value={r.productId} onChange={(e) => setRow(i, { productId: e.target.value, modelId: '' })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select className="mnt__input" value={r.modelId} onChange={(e) => setRow(i, { modelId: e.target.value })}>
                <option value="">— model —</option>
                {modelsFor(r.productId).map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
              </select>
              <input className="mnt__input" type="number" min={1} value={r.quantity} onChange={(e) => setRow(i, { quantity: Math.max(1, +e.target.value) })} />
              <button className="btn btn--ghost ppc__sm" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        {err && <span className="mnt__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>{busy ? '…' : 'Submit → PPC'}</button>
      </div>
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
