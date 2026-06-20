import { useEffect, useState } from 'react'
import { getAwaitingForward, forwardJob, listPpcRequests, getOrders, type AwaitingForwardJob, type PpcRequest, type Order } from '../lib/api'
import './OrdersDesktop.css'

// PPC Hub on the desktop command centre (docs/12). PPC keeps the ball rolling:
// approve incoming requests, plan orders, and — once Design confirms — FORWARD the
// job to production (optionally SPLIT it). This is the desk that starts the floor.
export default function PpcDesktop({ onReviewRequest, onOpenJob, onGotoOrders }: {
  onReviewRequest: (r: PpcRequest) => void
  onOpenJob?: (id: string) => void
  onGotoOrders: () => void
}) {
  const [forward, setForward] = useState<AwaitingForwardJob[] | null>(null)
  const [requests, setRequests] = useState<PpcRequest[] | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)

  function load() {
    getAwaitingForward().then((r) => setForward(r.jobs)).catch(() => setForward([]))
    listPpcRequests('submitted').then((r) => setRequests(r.requests)).catch(() => setRequests([]))
    getOrders().then((r) => setOrders(r.orders)).catch(() => setOrders([]))
  }
  useEffect(load, [])

  const toPlan = (orders ?? []).filter((o) => ['submitted', 'planning'].includes(o.derivedStatus || o.status))
  const inFlight = (orders ?? []).filter((o) => ['in_production', 'ready'].includes(o.derivedStatus || o.status))

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">PPC Hub</h1>
        <span className="dw__sub">the desk that keeps the floor moving</span>
      </div>

      {/* quick stats */}
      <div className="ppw__stats">
        <div className="ppw__stat"><span className="ppw__sn">{toPlan.length}</span><span className="ppw__sl">orders to plan</span></div>
        <div className="ppw__stat"><span className="ppw__sn">{forward?.length ?? 0}</span><span className="ppw__sl">designs to forward</span></div>
        <div className="ppw__stat"><span className="ppw__sn">{requests?.length ?? 0}</span><span className="ppw__sl">requests to approve</span></div>
        <div className="ppw__stat"><span className="ppw__sn">{inFlight.length}</span><span className="ppw__sl">orders in production</span></div>
      </div>

      <div className="ppw">
        {/* Design confirmed → forward (the PPC → production handoff, with split) */}
        <div className="dw__c">
          <h3 className="dwm__ttl">Design confirmed · forward to production <span className="dw__lbl">tell production what to make — split if needed → Cutting first</span></h3>
          {!forward ? <div className="dw__empty">Loading…</div> : forward.length === 0 ? <div className="dw__empty">Nothing waiting — Design hasn't confirmed any jobs.</div> : (
            <div className="ppw__grid">{forward.map((j) => <ForwardCard key={j.id} job={j} onOpenJob={onOpenJob} onDone={load} />)}</div>
          )}
        </div>

        {/* Incoming PPC requests to approve into jobs */}
        <div className="dw__c">
          <h3 className="dwm__ttl">Requests to approve <span className="dw__lbl">sale sheets / new requests → jobs</span></h3>
          {!requests ? <div className="dw__empty">Loading…</div> : requests.length === 0 ? <div className="dw__empty">No pending requests.</div> : (
            <div className="dw__cards">
              {requests.map((r) => {
                const qty = r.models.reduce((s, m) => s + m.quantity, 0)
                return (
                  <button key={r.id} className="dw__pcard" onClick={() => onReviewRequest(r)}>
                    <span className="dw__pcard-no">{r.name || r.requestNo}{r.priority === 'urgent' && <span className="dw__urgent">URGENT</span>}</span>
                    <span className="dw__pcard-meta">{r.name ? `${r.requestNo} · ` : ''}{r.product.name} · {qty} units · {r.models.length} line{r.models.length > 1 ? 's' : ''}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Orders to plan (per-item make / from-stock happens on PPC's device) */}
        <div className="dw__c">
          <h3 className="dwm__ttl">Orders to plan <span className="dw__lbl">decide make vs from-stock per line</span> <button className="ppw__link" onClick={onGotoOrders}>open Orders ›</button></h3>
          {!orders ? <div className="dw__empty">Loading…</div> : toPlan.length === 0 ? <div className="dw__empty">No orders waiting to be planned.</div> : (
            <div className="ppw__orows">
              {toPlan.map((o) => (
                <button key={o.id} className="ppw__orow" onClick={onGotoOrders}>
                  <b>{o.name || o.orderNo}</b>
                  <span>{o.client} · {o.items.length} line{o.items.length > 1 ? 's' : ''} · {(o.derivedStatus || o.status).replace(/_/g, ' ')}{o.priority === 'urgent' ? ' · URGENT' : ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ForwardCard({ job, onOpenJob, onDone }: { job: AwaitingForwardJob; onOpenJob?: (id: string) => void; onDone: () => void }) {
  const [split, setSplit] = useState(1)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  async function send() {
    setBusy(true); setErr(null)
    try { await forwardJob(job.id, split > 1 ? { splitInto: split } : undefined); onDone() }
    catch (e) { setErr(e instanceof Error ? e.message : 'failed'); setBusy(false) }
  }
  return (
    <div className="ppw__fcard">
      <div className="ppw__ftop">
        <button className="qcw__job" onClick={() => onOpenJob?.(job.id)}>{job.name || job.displayLabel}</button>
        {job.priority === 'urgent' && <span className="dw__urgent">URGENT</span>}
      </div>
      <div className="qcw__meta">{job.product?.name} · {job.totalQty} units{job.order ? ` · ${job.order.client}` : ''}{job.hasDesignFile ? ' · 📎 design file' : ''}</div>
      <div className="ppw__fact">
        <label className="ppw__split">split
          <input type="number" min={1} max={job.totalQty} value={split} onChange={(e) => setSplit(Math.max(1, Math.min(job.totalQty, Number(e.target.value) || 1)))} />
          {split > 1 ? <span className="mono-label">→ {split} jobs of ~{Math.ceil(job.totalQty / split)}</span> : <span className="mono-label">→ single job</span>}
        </label>
        <button className="ord__btn ord__btn--solid" disabled={busy} onClick={send}>{busy ? '…' : split > 1 ? `Forward · split ${split}` : 'Forward → Cutting'}</button>
      </div>
      {err && <span className="ppw__err">{err}</span>}
    </div>
  )
}
