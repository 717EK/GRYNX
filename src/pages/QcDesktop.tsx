import { useEffect, useState } from 'react'
import { getQcReports, approveQcHold, resolveQcReport, dismissQcReport, type QcReport } from '../lib/api'
import './OrdersDesktop.css'

// Admin's QC oversight (docs/12 parallel QC). The decision the owner owns here is
// approving a HARD HOLD (QC requests it; admin engages it → blocks FG/dispatch).
// Also a single board of every open QC report across the floor.
export default function QcDesktop({ onOpenJob }: { onOpenJob?: (id: string) => void }) {
  const [reports, setReports] = useState<QcReport[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function load() { getQcReports({ scope: 'all', status: 'open' }).then((r) => setReports(r.reports)).catch(() => setReports([])) }
  useEffect(load, [])

  async function act(id: string, fn: () => Promise<unknown>) { setBusy(id); try { await fn(); load() } catch { setBusy(null) } }

  const holdReq = (reports ?? []).filter((r) => r.holdRequested && !r.holdApproved)
  const held = (reports ?? []).filter((r) => r.holdApproved)
  const other = (reports ?? []).filter((r) => !r.holdRequested && !r.holdApproved)

  const Card = (r: QcReport, kind: 'approve' | 'held' | 'open') => (
    <div key={r.id} className={`qcw__card ${kind === 'held' ? 'qcw__card--held' : kind === 'approve' ? 'qcw__card--req' : ''}`}>
      <div className="qcw__top">
        <button className="qcw__job" onClick={() => onOpenJob?.(r.jobId)}>{r.job.displayLabel}</button>
        <span className="qcw__kind">{r.kind === 'issue' ? `⚠ issue${r.severity ? ` · ${r.severity}` : ''}` : r.kind === 'suggestion' ? '💡 suggestion' : '📝 note'}</span>
      </div>
      <div className="qcw__meta">{r.job.product?.name}{r.station ? ` · ${r.station.name}` : ''} · {r.raisedByName} · {new Date(r.raisedAt).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      <div className="qcw__note">{r.note}</div>
      {r.photoUrl && <img className="qcw__photo" src={r.photoUrl} alt="defect" />}
      <div className="qcw__actions">
        {kind === 'approve' && <button className="ord__btn ord__btn--danger" disabled={busy === r.id} onClick={() => act(r.id, () => approveQcHold(r.id))}>⛔ Approve hard hold</button>}
        <button className="ord__btn" disabled={busy === r.id} onClick={() => act(r.id, () => resolveQcReport(r.id, 'cleared by admin'))}>{kind === 'held' ? '✓ Resolve & lift hold' : '✓ Resolve'}</button>
        {kind === 'open' && r.kind !== 'issue' && <button className="ord__btn ord__btn--ghost" disabled={busy === r.id} onClick={() => act(r.id, () => dismissQcReport(r.id))}>Dismiss</button>}
      </div>
    </div>
  )

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">QC Oversight</h1>
        <span className="dw__sub">{reports ? `${reports.length} open` : 'loading…'}{holdReq.length > 0 ? ` · ${holdReq.length} hold${holdReq.length > 1 ? 's' : ''} awaiting you` : ''}</span>
      </div>

      {!reports ? <div className="dw__empty">Loading…</div> : reports.length === 0 ? <div className="dw__empty">No open QC reports — floor's clean.</div> : (
        <div className="qcw">
          {holdReq.length > 0 && (
            <div className="dw__c">
              <h3 className="dwm__ttl">Hard holds awaiting your approval <span className="dw__lbl">QC requested · blocks FG/dispatch once approved</span></h3>
              <div className="qcw__grid">{holdReq.map((r) => Card(r, 'approve'))}</div>
            </div>
          )}
          {held.length > 0 && (
            <div className="dw__c">
              <h3 className="dwm__ttl">Active hard holds <span className="dw__lbl">FG/dispatch blocked until resolved</span></h3>
              <div className="qcw__grid">{held.map((r) => Card(r, 'held'))}</div>
            </div>
          )}
          <div className="dw__c">
            <h3 className="dwm__ttl">Open reports <span className="dw__lbl">issues · suggestions · notes (advisory)</span></h3>
            {other.length === 0 ? <div className="dw__empty">Nothing else open.</div> : <div className="qcw__grid">{other.map((r) => Card(r, 'open'))}</div>}
          </div>
        </div>
      )}
    </section>
  )
}
