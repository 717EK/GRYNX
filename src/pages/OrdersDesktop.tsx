import { useEffect, useState } from 'react'
import { useCatalogue } from '../lib/useCatalogue'
import { getOrders, getOrder, createOrder, raiseOrderItemJob, markOrderItemFromStock, type Order, type OrderInput } from '../lib/api'
import './OrdersDesktop.css'

const STATUS_TONE: Record<string, string> = {
  draft: 'mut', submitted: 'lime', planning: 'amber', in_production: 'amber', ready: 'teal', dispatched: 'teal', closed: 'mut', cancelled: 'red', on_hold: 'red',
}

// Orders view for the command centre (docs/12 phase 3). Sales/PPC/admin manage
// orders; PPC raises a job per line-item that needs production. Production progress
// is derived from the order's sub-jobs.
export default function OrdersDesktop({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function load() { getOrders().then((r) => setOrders(r.orders)).catch(() => setOrders([])) }
  useEffect(() => { load() }, [])

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">Orders</h1>
        <span className="dw__sub">{orders ? `${orders.length} orders` : 'loading…'}</span>
        <button className="dw__pill ord__new" onClick={() => setCreating(true)}>＋ New Order</button>
      </div>
      {!orders ? <div className="dw__empty">Loading…</div> : orders.length === 0 ? <div className="dw__empty">No orders yet — create one.</div> : (
        <div className="ord__grid">
          {orders.map((o) => (
            <button key={o.id} className="ord__card" onClick={() => setOpenId(o.id)}>
              <div className="ord__card-top">
                <span className="ord__no">{o.name || o.orderNo}</span>
                <span className={`ord__badge ord__badge--${STATUS_TONE[o.derivedStatus] ?? 'mut'}`}>{o.derivedStatus.replace(/_/g, ' ')}</span>
              </div>
              <span className="ord__client">{o.name ? `${o.orderNo} · ` : ''}{o.client}{o.priority === 'urgent' ? ' · URGENT' : ''}</span>
              <div className="ord__prog">
                <span>{o.rollup.resolved}/{o.rollup.totalItems} items done</span>
                <span>{o.rollup.totalJobs} job{o.rollup.totalJobs === 1 ? '' : 's'}{o.rollup.fromStock ? ` · ${o.rollup.fromStock} from stock` : ''}</span>
              </div>
              <div className="ord__bar"><i style={{ width: `${o.rollup.totalItems ? (o.rollup.resolved / o.rollup.totalItems) * 100 : 0}%` }} /></div>
            </button>
          ))}
        </div>
      )}

      {openId && <OrderDetail id={openId} onClose={() => { setOpenId(null); load() }} onOpenJob={onOpenJob} />}
      {creating && <CreateOrder onClose={() => setCreating(false)} onDone={() => { setCreating(false); load() }} />}
    </section>
  )
}

function OrderDetail({ id, onClose, onOpenJob }: { id: string; onClose: () => void; onOpenJob: (j: string) => void }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  function load() { getOrder(id).then((r) => setOrder(r.order)).catch(() => {}) }
  useEffect(() => { load() }, [id])

  async function raise(itemId: string) {
    setBusy(itemId)
    try { await raiseOrderItemJob(id, itemId); load() } finally { setBusy(null) }
  }
  async function stock(itemId: string, v: boolean) {
    setBusy(itemId)
    try { await markOrderItemFromStock(id, itemId, v); load() } finally { setBusy(null) }
  }

  return (
    <div className="dw__overlay" onMouseDown={onClose}>
      <div className="dw__frame dw__frame--wide ord__detail" onMouseDown={(e) => e.stopPropagation()}>
        <button className="dw__close" onClick={onClose} aria-label="Close">×</button>
        {!order ? <div className="dw__empty">Loading…</div> : (
          <>
            <div className="ord__dh">
              <div>
                <h2 className="ord__dh-title">{order.name || order.orderNo}</h2>
                <span className="ord__dh-sub">{order.orderNo} · {order.client} · {order.priority}{order.targetDate ? ` · target ${new Date(order.targetDate).toLocaleDateString()}` : ''}</span>
              </div>
              <span className={`ord__badge ord__badge--${STATUS_TONE[order.derivedStatus] ?? 'mut'}`}>{order.derivedStatus.replace(/_/g, ' ')}</span>
            </div>
            {order.notes && <p className="ord__notes">{order.notes}</p>}
            <table className="ord__items">
              <thead><tr><th>Item</th><th>Qty</th><th>Status / Job</th><th></th></tr></thead>
              <tbody>
                {order.items.map((it) => {
                  const jobs = order.jobs.filter((j) => j.orderItemId === it.id)
                  return (
                    <tr key={it.id}>
                      <td><b>{it.product.name}</b>{it.model ? ` · ${it.model.code}` : ''}{it.size ? ` · ${it.size}` : ''}{it.note ? <span className="ord__inote"> — {it.note}</span> : ''}</td>
                      <td className="ord__qty">{it.quantity}</td>
                      <td>
                        {it.fromStock ? <span className="ord__badge ord__badge--teal">from stock</span> : jobs.length === 0 ? <span className="ord__mut">no job yet</span> : jobs.map((j) => (
                          <button key={j.id} className="ord__joblink" onClick={() => onOpenJob(j.id)}>{j.displayLabel} <em>{j.status.replace(/_/g, ' ')}</em></button>
                        ))}
                      </td>
                      <td className="ord__actions">
                        {!it.fromStock && jobs.length === 0 && <button className="ord__btn" disabled={busy === it.id} onClick={() => raise(it.id)}>{busy === it.id ? '…' : 'Raise job'}</button>}
                        {jobs.length === 0 && <button className="ord__btn ord__btn--ghost" disabled={busy === it.id} onClick={() => stock(it.id, !it.fromStock)}>{it.fromStock ? 'unstock' : 'from stock'}</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="dw__lbl ord__legend">PPC raises a job per item that needs making, or marks it fulfilled from FG stock. The order is ready to dispatch once every item is resolved (full FG-stock check + reservation arrives in phase 5).</p>
          </>
        )}
      </div>
    </div>
  )
}

function CreateOrder({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { catalogue } = useCatalogue()
  const products = catalogue ?? []
  const [client, setClient] = useState('')
  const [name, setName] = useState('')
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal')
  const [rows, setRows] = useState<{ productId: string; modelId: string; quantity: number }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const addRow = () => setRows((r) => [...r, { productId: products[0]?.id ?? '', modelId: '', quantity: 1 }])
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const modelsFor = (pid: string) => products.find((p) => p.id === pid)?.models ?? []

  async function submit() {
    setErr(null)
    if (!client.trim()) return setErr('Client is required')
    const items = rows.filter((r) => r.productId && r.quantity > 0).map((r) => ({ productId: r.productId, modelId: r.modelId || undefined, quantity: r.quantity }))
    if (items.length === 0) return setErr('Add at least one line item')
    setBusy(true)
    try {
      const input: OrderInput = { client: client.trim(), name: name.trim() || undefined, priority, submit: true, items }
      await createOrder(input)
      onDone()
    } catch { setErr('Could not create order'); setBusy(false) }
  }

  return (
    <div className="dw__overlay" onMouseDown={onClose}>
      <div className="dw__frame dw__frame--wide ord__create" onMouseDown={(e) => e.stopPropagation()}>
        <button className="dw__close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="ord__dh-title">New Order</h2>
        <div className="ord__form">
          <label className="ord__f"><span className="dw__lbl">Client *</span><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Emaar Events" /></label>
          <label className="ord__f"><span className="dw__lbl">Order name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SS 60x40 Truss — Dubai" /></label>
          <label className="ord__f"><span className="dw__lbl">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as 'normal' | 'urgent')}><option value="normal">Normal</option><option value="urgent">Urgent</option></select>
          </label>
        </div>
        <div className="ord__lines">
          <div className="ord__lines-head"><span className="dw__lbl">Line items</span><button className="ord__btn" onClick={addRow}>＋ Add item</button></div>
          {rows.length === 0 && <div className="ord__mut">No items yet — add one.</div>}
          {rows.map((r, i) => (
            <div key={i} className="ord__line">
              <select value={r.productId} onChange={(e) => setRow(i, { productId: e.target.value, modelId: '' })}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={r.modelId} onChange={(e) => setRow(i, { modelId: e.target.value })}>
                <option value="">— model —</option>
                {modelsFor(r.productId).map((m) => <option key={m.id} value={m.id}>{m.code}</option>)}
              </select>
              <input type="number" min={1} value={r.quantity} onChange={(e) => setRow(i, { quantity: Math.max(1, +e.target.value) })} />
              <button className="ord__btn ord__btn--ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
        {err && <span className="ord__err">{err}</span>}
        <button className="dw__pill ord__submit" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create order'}</button>
      </div>
    </div>
  )
}
