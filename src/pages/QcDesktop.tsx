import { useEffect, useState } from 'react'
import { getQcReports, getQcEscapes, approveQcHold, resolveQcReport, dismissQcReport, type QcReport } from '../lib/api'
import './OrdersDesktop.css'

const STALE_MS = 4 * 60 * 60 * 1000 // a hard hold open >4h is escalated
const fmtAge = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// Admin's QC oversight (docs/12 parallel QC). The decisions the owner owns here:
// approve a requested HARD HOLD, watch holds that have been blocking too long
// (escalated), and review ESCAPES — open issues on jobs that already closed.
export default function QcDesktop({ onOpenJob }: { onOpenJob?: (id: string) => void }) {
  const [reports, setReports] = useState<QcReport[] | null>(null)
  const [escapes, setEscapes] = useState<QcReport[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  function load() {
    getQcReports({ scope: 'all', status: 'open' }).then((r) => setReports(r.reports)).catch(() => setReports([]))
    getQcEscapes().then((r) => setEscapes(r.reports)).catch(() => setEscapes([]))
  }
  useEffect(load, [])

  async function act(id: string, fn: () => Promise<unknown>) { setBusy(id); try { await fn(); load() } catch { setBusy(null) } }

  const holdReq = (reports ?? []).filter((r) => r.holdRequested && !r.holdApproved)
  const held = (reports ?? []).filter((r) => r.holdApproved)
  const other = (reports ?? []).filter((r) => !r.holdRequested && !r.holdApproved)
  const staleCount = held.filter((r) => r.holdApprovedAt && Date.now() - new Date(r.holdApprovedAt).getTime() > STALE_MS).length

  const Card = (r: QcReport, kind: 'approve' | 'held' | 'open' | 'escape') => {
    const stale = kind === 'held' && r.holdApprovedAt && Date.now() - new Date(r.holdApprovedAt).getTime() > STALE_MS
    return (
      <div key={r.id} className={`qcw__card ${kind === 'held' || kind === 'escape' ? 'qcw__card--held' : kind === 'approve' ? 'qcw__card--req' : ''} ${stale ? 'qcw__card--stale' : ''}`}>
        <div className="qcw__top">
          <button className="qcw__job" onClick={() => onOpenJob?.(r.jobId)}>{r.job.displayLabel}</button>
          {stale ? <span className="qcw__esc">⏱ ESCALATED · {r.holdApprovedAt ? fmtAge(r.holdApprovedAt) : ''}</span>
            : kind === 'held' ? <span className="qcw__kind">held {r.holdApprovedAt ? fmtAge(r.holdApprovedAt) : ''}</span>
            : kind === 'escape' ? <span className="qcw__esc">🚨 shipped unresolved</span>
            : <span className="qcw__kind">{r.kind === 'issue' ? `⚠ issue${r.severity ? ` · ${r.severity}` : ''}` : r.kind === 'suggestion' ? '💡 suggestion' : '📝 note'}</span>}
        </div>
        <div className="qcw__meta">{r.job.product?.name}{r.station ? ` · ${r.station.name}` : ''} · {r.raisedByName} · raised {fmtAge(r.raisedAt)} ago</div>
        <div className="qcw__note">{r.note}</div>
        {r.photoUrl && <img className="qcw__photo" src={r.photoUrl} alt="defect" />}
        <div className="qcw__actions">
          {kind === 'approve' && <button className="ord__btn ord__btn--danger" disabled={busy === r.id} onClick={() => act(r.id, () => approveQcHold(r.id))}>⛔ Approve hard hold</button>}
          <button className="ord__btn" disabled={busy === r.id} onClick={() => act(r.id, () => resolveQcReport(r.id, kind === 'escape' ? 'reviewed after close' : 'cleared by admin'))}>{kind === 'held' ? '✓ Resolve & lift hold' : kind === 'escape' ? '✓ Reviewed' : '✓ Resolve'}</button>
          {kind === 'open' && r.kind !== 'issue' && <button className="ord__btn ord__btn--ghost" disabled={busy === r.id} onClick={() => act(r.id, () => dismissQcReport(r.id))}>Dismiss</button>}
        </div>
      </div>
    )
  }

  const nothing = reports && reports.length === 0 && escapes && escapes.length === 0

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">QC Oversight</h1>
        <span className="dw__sub">
          {reports ? `${reports.length} open` : 'loading…'}
          {holdReq.length > 0 ? ` · ${holdReq.length} hold${holdReq.length > 1 ? 's' : ''} awaiting you` : ''}
          {staleCount > 0 ? ` · ${staleCount} escalated` : ''}
          {(escapes?.length ?? 0) > 0 ? ` · ${escapes!.length} escape${escapes!.length > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {!reports ? <div className="dw__empty">Loading…</div> : nothing ? <div className="dw__empty">No open QC reports — floor's clean.</div> : (
        <div className="qcw">
          {/* ESCAPES — open issues that already shipped/closed (top priority) */}
          {(escapes?.length ?? 0) > 0 && (
            <div className="dw__c qcw__c--escape">
              <h3 className="dwm__ttl">🚨 Escapes — closed with open QC issues <span className="dw__lbl">a defect left without being resolved</span></h3>
              <div className="qcw__grid">{escapes!.map((r) => Card(r, 'escape'))}</div>
            </div>
          )}
          {holdReq.length > 0 && (
            <div className="dw__c">
              <h3 className="dwm__ttl">Hard holds awaiting your approval <span className="dw__lbl">QC requested · blocks FG/dispatch once approved</span></h3>
              <div className="qcw__grid">{holdReq.map((r) => Card(r, 'approve'))}</div>
            </div>
          )}
          {held.length > 0 && (
            <div className="dw__c">
              <h3 className="dwm__ttl">Active hard holds <span className="dw__lbl">FG/dispatch blocked until resolved{staleCount > 0 ? ` · ${staleCount} over 4h` : ''}</span></h3>
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
