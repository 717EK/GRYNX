import { useEffect, useState } from 'react'
import { getAgenda, getDaySummary, askFloorUpdate, type Agenda, type DaySummary } from '../lib/api'
import './OrdersDesktop.css'

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Morning agenda' : h < 17 ? 'Today' : 'End of day' }

// Daily rhythm (docs/12 phase 7). The owner's twice-a-day glance: what's urgent /
// waiting on a decision this morning, what happened today this evening, and a
// one-click "ask the floor" broadcast.
export default function BriefingDesktop({ onOpenJob }: { onOpenJob?: (id: string) => void }) {
  const [agenda, setAgenda] = useState<Agenda | null>(null)
  const [summary, setSummary] = useState<DaySummary | null>(null)
  const [asked, setAsked] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    getAgenda().then(setAgenda).catch(() => {})
    getDaySummary().then(setSummary).catch(() => {})
  }, [])

  async function ask(dept?: string) {
    setAsking(true); setAsked(null)
    try { const r = await askFloorUpdate(dept); setAsked(`Asked ${r.asked.join(', ')} for an update.`) }
    catch { setAsked('Could not send the request.') }
    finally { setAsking(false) }
  }

  const d = agenda?.decisions
  const fmtMins = (m: number) => (m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`)
  const decisionCards: [string, number, string][] = d ? [
    ['PPC requests', d.ppcRequests, '◳'], ['Awaiting forward', d.awaitingForward, '▸'], ['Dispatch to approve', d.dispatchToApprove, '🚚'],
    ['Closures', d.closuresToApprove, '✓'], ['Open QC issues', d.openQcIssues, '⚠'],
    ['QC holds to approve', d.qcHoldsToApprove, '⛔'], ['Maintenance', d.openTickets, '⚙'],
  ] : []

  return (
    <section className="dw__view">
      <div className="dw__toolbar">
        <h1 className="dw__h1">{greet()}</h1>
        <span className="dw__sub">{agenda ? new Date(agenda.generatedAt).toLocaleString(undefined, { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'loading…'}</span>
        <button className="dw__pill" style={{ marginLeft: 'auto' }} disabled={asking} onClick={() => ask()}>{asking ? '…' : '📣 Ask the whole floor'}</button>
      </div>
      {asked && <p className="dw__lbl" style={{ color: 'var(--lime-ink)', marginBottom: 10 }}>{asked}</p>}

      <div className="brf">
        {/* decisions waiting */}
        <div className="dw__c">
          <h3 className="dwm__ttl">Waiting on you <span className="dw__lbl">approvals & decisions</span></h3>
          <div className="brf__dec">
            {decisionCards.map(([label, n, ico]) => (
              <div key={label} className={`brf__deccard ${n > 0 ? 'brf__deccard--on' : ''}`}>
                <span className="brf__ico">{ico}</span>
                <span className="brf__n">{n}</span>
                <span className="brf__l">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* overdue + urgent + due */}
        <div className="dw__c">
          <h3 className="dwm__ttl">Needs attention <span className="dw__lbl">overdue · urgent · due today</span></h3>
          {!agenda ? <div className="dw__empty">Loading…</div> : (agenda.overdue.length + agenda.urgentOrders.length + agenda.dueOrders.length === 0) ? <div className="dw__empty">Floor's clean — nothing flagged.</div> : (
            <div className="brf__list">
              {agenda.overdue.map((o) => (
                <button key={o.jobId} className="brf__row brf__row--red" onClick={() => onOpenJob?.(o.jobId)}>
                  <b>{o.label}</b><span>{o.station} · overdue {fmtMins(o.mins)}</span>
                </button>
              ))}
              {agenda.urgentOrders.map((o) => (
                <div key={o.id} className="brf__row brf__row--amber"><b>{o.name || o.orderNo}</b><span>{o.client} · URGENT · {o.status.replace(/_/g, ' ')}</span></div>
              ))}
              {agenda.dueOrders.map((o) => (
                <div key={'d' + o.id} className="brf__row"><b>{o.name || o.orderNo}</b><span>{o.client} · due {o.targetDate ? new Date(o.targetDate).toLocaleDateString() : 'today'}</span></div>
              ))}
            </div>
          )}
        </div>

        {/* today's activity (evening summary) */}
        <div className="dw__c">
          <h3 className="dwm__ttl">Today so far <span className="dw__lbl">end-of-day summary</span></h3>
          {!summary ? <div className="dw__empty">Loading…</div> : (
            <div className="brf__stats">
              {([['Orders in', summary.ordersCreated], ['Jobs raised', summary.jobsCreated], ['Jobs closed', summary.jobsClosed], ['Orders shipped', summary.shipped], ['Station scans', summary.scans], ['QC checks', summary.qcMarks], ['QC issues', summary.qcIssuesRaised], ['Material needs', summary.materialNeeds]] as [string, number][]).map(([l, n]) => (
                <div key={l} className="brf__stat"><span className="brf__sn">{n}</span><span className="brf__sl">{l}</span></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ask a specific department */}
      <div className="dw__c" style={{ marginTop: 'clamp(12px,1vw,22px)' }}>
        <h3 className="dwm__ttl">Ask a department <span className="dw__lbl">one tap → notifies the head</span></h3>
        <div className="brf__ask">
          {[['DESIGN', 'Design'], ['PRODUCTION', 'Production'], ['QC', 'QC'], ['FG_STOCK', 'FG Stock']].map(([code, name]) => (
            <button key={code} className="ord__btn ord__btn--ghost" disabled={asking} onClick={() => ask(code)}>📣 {name}</button>
          ))}
        </div>
      </div>
      <p className="dwa__legend dw__lbl">Rule-based for now; an AI-written morning briefing + evening summary land once the local Ollama assistant is wired (docs/08).</p>
    </section>
  )
}
