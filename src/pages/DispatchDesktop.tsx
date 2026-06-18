import { useEffect, useState } from 'react'
import { getDispatches, approveDispatch, shipDispatch, type Dispatch } from '../lib/api'
import './OrdersDesktop.css'

// Dispatch view (command centre, docs/12 phase 6). Requested → admin approves →
// ship (whole order; deducts FG stock). FG auto-raises requests when an order is
// fully in stock; Sales/PPC can also request.
export default function DispatchDesktop({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const [list, setList] = useState<Dispatch[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [shipping, setShipping] = useState<Dispatch | null>(null)

  function load() { getDispatches().then((r) => setList(r.dispatches)).catch(() => setList([])) }
  useEffect(() => { load() }, [])

  async function approve(d: Dispatch) { setBusy(d.id); try { await approveDispatch(d.id); load() } finally { setBusy(null) } }

  const requested = (list ?? []).filter((d) => d.status === 'requested')
  const approved = (list ?? []).filter((d) => d.status === 'approved')
  const shipped = (list ?? []).filter((d) => d.status === 'shipped')

  const card = (d: Dispatch, actions: React.ReactNode) => (
    <div key={d.id} className="ord__card" style={{ cursor: onOpenOrder ? 'pointer' : 'default' }} onClick={() => d.order && onOpenOrder?.(d.order.id)}>
      <div className="ord__card-top">
        <span className="ord__no">{d.order?.name || d.order?.orderNo}</span>
        <span className={`ord__badge ord__badge--${d.status === 'shipped' ? 'teal' : d.status === 'approved' ? 'lime' : 'amber'}`}>{d.status}</span>
      </div>
      <span className="ord__client">{d.order?.orderNo} · {d.order?.client}{d.order?.priority === 'urgent' ? ' · URGENT' : ''} · raised by {d.raisedBy}</span>
      {d.vehicle && <span className="ord__client">🚚 {d.vehicle}</span>}
      <div onClick={(e) => e.stopPropagation()}>{actions}</div>
    </div>
  )

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">Dispatch</h1>
        <span className="dw__sub">{list ? `${requested.length} to approve · ${approved.length} to ship` : 'loading…'}</span>
      </div>
      {!list ? <div className="dw__empty">Loading…</div> : list.length === 0 ? <div className="dw__empty">No dispatches yet — they appear when an order is fully in stock.</div> : (
        <div className="dsp">
          <div className="dsp__col">
            <h3 className="dwm__ttl">Awaiting approval <span className="dw__lbl">{requested.length}</span></h3>
            <div className="ord__grid ord__grid--1">{requested.length === 0 ? <div className="dw__empty">None.</div> : requested.map((d) => card(d, <button className="ord__btn" style={{ marginTop: 8 }} disabled={busy === d.id} onClick={() => approve(d)}>{busy === d.id ? '…' : '✓ Approve'}</button>))}</div>
          </div>
          <div className="dsp__col">
            <h3 className="dwm__ttl">Approved · ready to ship <span className="dw__lbl">{approved.length}</span></h3>
            <div className="ord__grid ord__grid--1">{approved.length === 0 ? <div className="dw__empty">None.</div> : approved.map((d) => card(d, <button className="ord__btn" style={{ marginTop: 8 }} onClick={() => setShipping(d)}>🚚 Ship whole order</button>))}</div>
          </div>
          <div className="dsp__col">
            <h3 className="dwm__ttl">Shipped <span className="dw__lbl">{shipped.length}</span></h3>
            <div className="ord__grid ord__grid--1">{shipped.length === 0 ? <div className="dw__empty">None.</div> : shipped.map((d) => card(d, null))}</div>
          </div>
        </div>
      )}
      <p className="dwa__legend dw__lbl">Shipping deducts the order's units from FG stock and closes the order. Whole-order only — never partial.</p>
      {shipping && <ShipModal d={shipping} onClose={() => setShipping(null)} onDone={() => { setShipping(null); load() }} setBusy={setBusy} busy={busy} />}
    </section>
  )
}

function ShipModal({ d, onClose, onDone, busy, setBusy }: { d: Dispatch; onClose: () => void; onDone: () => void; busy: string | null; setBusy: (s: string | null) => void }) {
  const [vehicle, setVehicle] = useState('')
  async function ship() { setBusy(d.id); try { await shipDispatch(d.id, { vehicle: vehicle.trim() || undefined }); onDone() } finally { setBusy(null) } }
  return (
    <div className="dw__overlay" onMouseDown={onClose}>
      <div className="dw__frame dw__frame--wide ord__create" onMouseDown={(e) => e.stopPropagation()} style={{ maxHeight: 320 }}>
        <button className="dw__close" onClick={onClose} aria-label="Close">×</button>
        <h2 className="ord__dh-title">Ship {d.order?.name || d.order?.orderNo}</h2>
        <p className="ord__notes">{d.order?.client} · this deducts the whole order from FG stock and closes it.</p>
        <label className="ord__f" style={{ marginTop: 14 }}><span className="dw__lbl">Vehicle / reference (optional)</span><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. TRUCK-MH04-1234" /></label>
        <button className="dw__pill ord__submit" disabled={busy === d.id} onClick={ship}>{busy === d.id ? 'Shipping…' : '🚚 Confirm ship'}</button>
      </div>
    </div>
  )
}
