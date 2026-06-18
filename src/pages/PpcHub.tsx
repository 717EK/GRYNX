import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getOrders, getOrder, raiseOrderItemJob, markOrderItemFromStock, type Order } from '../lib/api'
import ReportButton from '../components/ReportButton'
import './DeptHome.css'
import './Maintenance.css'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'New', planning: 'Planning', in_production: 'In production', ready: 'Ready', dispatched: 'Dispatched', closed: 'Closed', cancelled: 'Cancelled', on_hold: 'On hold',
}

// PPC Hub (docs/12) — the planning desk that keeps the ball rolling. Sales orders
// land here; PPC checks stock per item, raises a job for what must be made, and
// tracks everything in flight. This is PPC's home (landingFor → 'ppchub').
export default function PpcHub({
  user, onLock, onNewRequest, onSheets, onInbox, onOpenJob,
}: {
  user: SessionUser
  onLock: () => void
  onNewRequest: () => void
  onSheets: () => void
  onInbox: () => void
  onOpenJob: (id: string) => void
}) {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [planning, setPlanning] = useState<Order | null>(null)

  function load() { getOrders().then((r) => setOrders(r.orders)).catch(() => setOrders([])) }
  useEffect(() => { load() }, [])

  const toPlan = (orders ?? []).filter((o) => ['submitted', 'planning'].includes(o.derivedStatus))
  const inFlight = (orders ?? []).filter((o) => ['in_production', 'ready'].includes(o.derivedStatus))
  const done = (orders ?? []).filter((o) => ['dispatched', 'closed', 'cancelled'].includes(o.derivedStatus))

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <span />
          <div className="screen__titles">
            <h1 className="screen__title display">PPC · Planning</h1>
            <span className="mono-label">{orders ? `${toPlan.length} to plan · ${inFlight.length} in flight` : 'Loading…'}</span>
          </div>
          <ReportButton />
        </header>
        <div className="screen__scroll">
          <div className="ppc__quick">
            <button className="ppc__qbtn" onClick={onNewRequest}>＋ Request</button>
            <button className="ppc__qbtn" onClick={onSheets}>⎘ Sheets</button>
            <button className="ppc__qbtn" onClick={onInbox}>▤ My Requests</button>
          </div>

          {orders === null ? <span className="dh__empty mono-label">Loading…</span> : (
            <>
              <Section title="To plan" tone="urgent" orders={toPlan} onOpen={setPlanning} empty="No new orders waiting. Sales hands orders here." />
              <Section title="In flight" tone="info" orders={inFlight} onOpen={setPlanning} />
              {done.length > 0 && <Section title="Completed" tone="done" orders={done} onOpen={setPlanning} />}
              {orders.length === 0 && <span className="dh__empty mono-label">No orders yet. When Sales submits an order it appears here to plan.</span>}
            </>
          )}
        </div>
      </main>
      <BottomBar />
      {planning && <PlanModal id={planning.id} onClose={() => { setPlanning(null); load() }} onOpenJob={onOpenJob} />}
    </div>
  )
}

function Section({ title, tone, orders, onOpen, empty }: { title: string; tone: string; orders: Order[]; onOpen: (o: Order) => void; empty?: string }) {
  if (orders.length === 0 && !empty) return null
  return (
    <section className="jsec">
      <h2 className="jsec__title mono-label">{title} <span className="jsec__count">{orders.length}</span></h2>
      {orders.length === 0 ? <span className="dh__empty mono-label">{empty}</span> : (
        <ul className="dh__list">
          {orders.map((o) => (
            <li key={o.id}>
              <button className="dh__row" onClick={() => onOpen(o)}>
                <span className="dh__main">
                  <span className="dh__label display">{o.name || o.orderNo}</span>
                  <span className="dh__meta mono-label">{o.orderNo} · {o.client} · {o.rollup.resolved}/{o.rollup.totalItems} items{o.priority === 'urgent' ? ' · URGENT' : ''}</span>
                </span>
                <span className="dh__right">
                  <span className={`dh__tag dh__tag--${tone} mono-label`}>{STATUS_LABEL[o.derivedStatus] ?? o.derivedStatus}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Per-order planning: for each line item, raise a job (make it) or mark from stock.
function PlanModal({ id, onClose, onOpenJob }: { id: string; onClose: () => void; onOpenJob: (j: string) => void }) {
  const [order, setOrder] = useState<Order | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  function load() { getOrder(id).then((r) => setOrder(r.order)).catch(() => {}) }
  useEffect(() => { load() }, [id])

  async function raise(itemId: string) { setBusy(itemId); try { await raiseOrderItemJob(id, itemId); load() } finally { setBusy(null) } }
  async function stock(itemId: string, v: boolean) { setBusy(itemId); try { await markOrderItemFromStock(id, itemId, v); load() } finally { setBusy(null) } }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">{order?.name || order?.orderNo || '…'}</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!order ? <span className="dh__empty mono-label">Loading…</span> : (
          <>
            <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{order.orderNo} · {order.client} · {STATUS_LABEL[order.derivedStatus]}</span>
            {order.notes && <p className="ppc__notes">{order.notes}</p>}
            <div className="ppc__items">
              {order.items.map((it) => {
                const jobs = order.jobs.filter((j) => j.orderItemId === it.id)
                return (
                  <div key={it.id} className="ppc__item">
                    <div className="ppc__item-head">
                      <b>{it.product.name}{it.model ? ` · ${it.model.code}` : ''}{it.size ? ` · ${it.size}` : ''}</b>
                      <span className="ppc__qty mono-label">×{it.quantity}</span>
                    </div>
                    {it.fromStock ? (
                      <div className="ppc__item-row">
                        <span className="dh__tag dh__tag--info mono-label">FROM STOCK</span>
                        <button className="btn btn--ghost ppc__sm" disabled={busy === it.id} onClick={() => stock(it.id, false)}>undo</button>
                      </div>
                    ) : jobs.length > 0 ? (
                      <div className="ppc__item-row">
                        {jobs.map((j) => <button key={j.id} className="ppc__joblink mono-label" onClick={() => onOpenJob(j.id)}>{j.displayLabel} · {j.status.replace(/_/g, ' ')}</button>)}
                      </div>
                    ) : (
                      <div className="ppc__item-row">
                        <button className="btn btn--solid ppc__sm" disabled={busy === it.id} onClick={() => raise(it.id)}>{busy === it.id ? '…' : '▸ Make (raise job)'}</button>
                        <button className="btn btn--ghost ppc__sm" disabled={busy === it.id} onClick={() => stock(it.id, true)}>✓ From stock</button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <span className="mono-label ppc__hint">ⓘ FG-stock check: mark items you already have in stock, raise jobs for the rest. The order is ready once every item is resolved.</span>
          </>
        )}
      </div>
    </div>
  )
}
