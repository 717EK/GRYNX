import { useEffect, useState } from 'react'
import type { SessionUser } from '../components/UtilityBars'
import CreateJob from './CreateJob'
import PpcReviewSheet from './PpcReviewSheet'
import JobDetail from './JobDetail'
import Maintenance from './Maintenance'
import MaintenanceDetail from './MaintenanceDetail'
import Notifications from './Notifications'
import CalendarWidget from '../components/CalendarWidget'
import dlyftLogo from '../assets/dlyft-logo.png'
import {
  getAdminStats, getJobs, listPpcRequests, notificationCount,
  type AdminStats, type JobDTO, type PpcRequest, type AttentionItem,
} from '../lib/api'
import './DeskWarm.css'

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved', in_production: 'In Production', in_qc: 'In QC', in_fg: 'In FG Stock',
  close_requested: 'Closure Req.', closed: 'Closed', cancelled: 'Cancelled', draft: 'Draft', pending_approval: 'Pending',
}
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—')
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

// build an SVG polyline path from a series
function linePath(vals: number[], w: number, h: number, pad = 6) {
  if (!vals.length) return ''
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0), range = max - min || 1
  const step = vals.length > 1 ? w / (vals.length - 1) : w
  return vals.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${(h - pad - ((v - min) / range) * (h - 2 * pad)).toFixed(1)}`).join(' ')
}

type Nav = 'dashboard' | 'jobs' | 'ppc'
type Popup =
  | null
  | { kind: 'create' }
  | { kind: 'review'; req: PpcRequest }
  | { kind: 'history'; jobId: string }
  | { kind: 'maintenance' }
  | { kind: 'maintdetail'; id: string }
  | { kind: 'notifications' }

export default function DesktopAdminWarm({ user, onLock }: { user: SessionUser; onLock: () => void }) {
  const [nav, setNav] = useState<Nav>('dashboard')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [jobs, setJobs] = useState<JobDTO[] | null>(null)
  const [ppc, setPpc] = useState<PpcRequest[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [q, setQ] = useState('')
  const [popup, setPopup] = useState<Popup>(null)
  const [unread, setUnread] = useState(0)

  function loadJobs() { getJobs().then((r) => setJobs(r.jobs)).catch(() => setJobs([])) }
  function loadPpc() { listPpcRequests('submitted').then((r) => setPpc(r.requests)).catch(() => setPpc([])) }
  useEffect(() => {
    const tick = () => getAdminStats().then(setStats).catch(() => {})
    tick(); loadJobs(); loadPpc(); notificationCount().then((r) => setUnread(r.unread)).catch(() => {})
    const h = setInterval(tick, 30_000)
    return () => clearInterval(h)
  }, [])
  function closePopup() { setPopup(null); loadJobs(); loadPpc(); getAdminStats().then(setStats).catch(() => {}); notificationCount().then((r) => setUnread(r.unread)).catch(() => {}) }
  const openJob = (jobId: string) => setPopup({ kind: 'history', jobId })
  const openAttn = (a: AttentionItem) => (a.kind === 'job' ? setPopup({ kind: 'history', jobId: a.id }) : setPopup({ kind: 'maintdetail', id: a.id }))

  const filtered = (jobs ?? [])
    .filter((j) => (statusFilter === 'all' ? true : statusFilter === 'active' ? !['closed', 'cancelled', 'draft'].includes(j.status) : j.status === statusFilter))
    .filter((j) => !q || j.displayLabel.toLowerCase().includes(q.toLowerCase()) || (j.product?.name ?? '').toLowerCase().includes(q.toLowerCase()))

  const k = stats?.kpis
  const tp = stats?.throughput ?? []
  // week-over-week delta on created
  const wk = tp.slice(-7).reduce((s, d) => s + d.created, 0)
  const prevWk = tp.slice(-14, -7).reduce((s, d) => s + d.created, 0)
  const delta = prevWk ? Math.round(((wk - prevWk) / prevWk) * 100) : 0
  const maxDept = Math.max(...(stats?.byDepartment ?? []).map((d) => d.count), 1)
  const snap = stats?.snapshot
  const pipeline = stats?.pipeline ?? []
  const maxPipe = Math.max(...pipeline.map((p) => p.count), 1)
  const bottleneck = [...pipeline].sort((a, b) => b.count - a.count)[0]
  const maxHold = Math.max(...(stats?.holds ?? []).map((h) => h.count), 1)
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="dw">
     <div className="dw__stage">
      {/* icon rail */}
      <aside className="dw__rail">
        <img className="dw__logo" src={dlyftLogo} alt="D-LYFT" />
        <button className={`dw__i ${nav === 'dashboard' ? 'is-on' : ''}`} title="Control Centre" onClick={() => setNav('dashboard')}>⌂</button>
        <button className={`dw__i ${nav === 'jobs' ? 'is-on' : ''}`} title="Job Board" onClick={() => setNav('jobs')}>▤</button>
        <button className={`dw__i ${nav === 'ppc' ? 'is-on' : ''}`} title="PPC Requests" onClick={() => setNav('ppc')}>◳</button>
        <button className="dw__i" title="Maintenance" onClick={() => setPopup({ kind: 'maintenance' })}>⚙</button>
        <div className="dw__rail-sp" />
        <button className="dw__i" title="Notifications" onClick={() => setPopup({ kind: 'notifications' })}>◔{unread > 0 && <span className="pip" />}</button>
        <button className="dw__i" title="Sign out" onClick={onLock}>⎋</button>
      </aside>

      <main className="dw__main">
        <header className="dw__head">
          <div>
            <div className="dw__hi">{greeting()}, {user.name.split(' ')[0]}</div>
            <div className="dw__sub">
              {today}
              {k && <> · <b>{k.pendingPpc} job{k.pendingPpc === 1 ? '' : 's'}</b> awaiting approval{k.overdue > 0 && <> · <span className="dw__red">{k.overdue} overdue</span> on the floor</>}</>}
            </div>
          </div>
          <div className="dw__head-r">
            <div className="dw__search">⌕ <input placeholder="Search jobs, products…" value={q} onChange={(e) => { setQ(e.target.value); setNav('jobs') }} /></div>
            <button className="dw__pill" onClick={() => setPopup({ kind: 'create' })}>＋ New Job</button>
            <button className="dw__ic" title="Notifications" onClick={() => setPopup({ kind: 'notifications' })}>🔔{unread > 0 && <span className="bdot" />}</button>
            <button className="dw__av" onClick={onLock} title={`${user.name} · sign out`}>{user.name.slice(0, 2).toUpperCase()}</button>
          </div>
        </header>

        {nav === 'dashboard' && (
          <section className="dwm">
            <div className="dwm__col">
              {/* GRYNX INTELLIGENCE */}
              <div className="dw__c dwm__intel">
                <h3 className="dwm__ttl">✦ GRYNX Intelligence <span className="dw__lbl" style={{ color: '#a59e8e' }}>live</span></h3>
                <div className="dwm__ins">
                  {(k?.overdue ?? 0) > 0 && <div className="dwm__in"><i style={{ background: '#e5503a' }} /><span><b>{k!.overdue} job{k!.overdue > 1 ? 's' : ''} overdue</b> — past stage SLA on the floor</span></div>}
                  {bottleneck && bottleneck.count >= 4 && <div className="dwm__in"><i style={{ background: '#e6962b' }} /><span><b>{bottleneck.department} overloaded</b> — {bottleneck.count} jobs (bottleneck forming)</span></div>}
                  {(snap?.onHold ?? 0) > 0 && <div className="dwm__in"><i style={{ background: '#e6962b' }} /><span><b>{snap!.onHold} on hold</b> — awaiting material / machine / approval</span></div>}
                  {((k?.pendingPpc ?? 0) > 0 || (k?.closureRequested ?? 0) > 0) && <div className="dwm__in"><i style={{ background: '#84cc16' }} /><span>{k!.pendingPpc} awaiting approval · {k!.closureRequested} closure{k!.closureRequested === 1 ? '' : 's'} pending sign-off</span></div>}
                  {stats && (k?.overdue ?? 0) === 0 && (snap?.onHold ?? 0) === 0 && (!bottleneck || bottleneck.count < 4) && <div className="dwm__in"><i style={{ background: '#84cc16' }} /><span>Floor running clean — nothing flagged right now.</span></div>}
                </div>
                {stats?.attention?.[0] && (
                  <div className="dwm__act">
                    <div><div className="dwm__act-t">Suggested action</div><div className="dwm__act-m">{stats.attention[0].label} — {stats.attention[0].sub}</div></div>
                    <button className="dwm__act-b" onClick={() => openAttn(stats.attention[0])}>Open ›</button>
                  </div>
                )}
              </div>

              {/* PRODUCTION SNAPSHOT */}
              <div className="dw__c">
                <span className="dw__lbl">Production snapshot</span>
                <div className="dwm__snap">
                  <button className="dwm__si" style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => { setStatusFilter('active'); setNav('jobs') }}><div className="n">{snap?.active ?? '—'}</div><div className="k">Active</div></button>
                  <div className="dwm__si hold"><div className="n">{snap?.onHold ?? 0}</div><div className="k">On Hold</div></div>
                  <div className="dwm__si urg"><div className="n">{snap?.urgent ?? 0}</div><div className="k">Urgent</div></div>
                  <button className="dwm__si" style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => { setStatusFilter('in_qc'); setNav('jobs') }}><div className="n">{snap?.inQc ?? 0}</div><div className="k">In QC</div></button>
                </div>
              </div>

              {/* PENDING APPROVALS */}
              <div className="dw__c">
                <span className="dw__lbl">Pending approvals</span>
                <div className="dwm__apr">
                  <div className="dwm__ar"><span>PPC Requests</span><span className="dwm__av"><span className="dwm__an">{k?.pendingPpc ?? 0}</span><button className="dwm__ab" onClick={() => setNav('ppc')}>Review ›</button></span></div>
                  <div className="dwm__ar"><span>Closures</span><span className="dwm__av"><span className="dwm__an">{k?.closureRequested ?? 0}</span><button className="dwm__ab" onClick={() => { setStatusFilter('close_requested'); setNav('jobs') }}>Sign ›</button></span></div>
                  <div className="dwm__ar"><span>Maintenance</span><span className="dwm__av"><span className="dwm__an">{k?.openTickets ?? 0}</span><button className="dwm__ab" onClick={() => setPopup({ kind: 'maintenance' })}>Open ›</button></span></div>
                </div>
              </div>

              {/* LIVE PIPELINE */}
              <div className="dw__c dwm__s3 dwm__pipe-card">
                <h3 className="dwm__ttl">Live Pipeline <span className="dw__lbl">jobs at each stage · click to open</span></h3>
                {pipeline.length === 0 ? <div className="dw__empty">No pipeline data.</div> : (
                  <div className="dwm__pipe">
                    {pipeline.map((s) => (
                      <button key={s.code} className={`dwm__stg ${bottleneck && s.code === bottleneck.code && s.count >= 4 ? 'bot' : ''}`} onClick={() => { setStatusFilter('active'); setNav('jobs') }}>
                        <div className="dwm__stg-k">{s.department}</div>
                        <div className="dwm__stg-n">{s.count}</div>
                        <div className="dwm__stg-h">{s.hold > 0 ? `${s.hold} hold` : ' '}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* FACTORY FEED */}
              <div className="dw__c">
                <h3 className="dwm__ttl">Live Factory Feed</h3>
                <div className="dwm__feed">
                  {!stats ? <div className="dw__empty">Loading…</div> : stats.recentActivity.length === 0 ? <div className="dw__empty">No activity yet.</div> : stats.recentActivity.slice(0, 5).map((a) => (
                    <div key={a.id} className="dwm__fr"><time>{fmtTime(a.at)}</time><span><b>{a.label}</b> {a.text}</span></div>
                  ))}
                </div>
              </div>

              {/* AGING */}
              <div className="dw__c">
                <h3 className="dwm__ttl">Aging Jobs <span className="dw__lbl">longest at station</span></h3>
                <div className="dwm__age">
                  {!stats ? <div className="dw__empty">Loading…</div> : stats.aging.length === 0 ? <div className="dw__empty">Nothing aging.</div> : stats.aging.slice(0, 4).map((a) => (
                    <button key={a.id} className="dwm__agr" onClick={() => openJob(a.id)}><span>{a.label} · {a.dept}</span><span className="dwm__agd">{a.days}d</span></button>
                  ))}
                </div>
              </div>

              {/* HOLD ANALYSIS */}
              <div className="dw__c">
                <h3 className="dwm__ttl">Hold Analysis</h3>
                {!stats || stats.holds.length === 0 ? <div className="dw__empty">No active holds.</div> : (
                  <div className="dwm__hold">
                    {stats.holds.map((h) => {
                      const col = h.code === 'material' ? '#e6962b' : h.code === 'breakdown' ? '#e5503a' : h.code === 'resource' ? '#3b82c4' : '#9a9384'
                      return <div key={h.code} className="dwm__hb"><span>{h.label}</span><span className="dwm__hbt"><span className="dwm__hbf" style={{ width: `${(h.count / maxHold) * 100}%`, background: col }} /></span><span className="dwm__hbn">{h.count}</span></div>
                    })}
                  </div>
                )}
              </div>

              {/* TODAY */}
              <div className="dw__c">
                <h3 className="dwm__ttl">Today <span className="dw__lbl">on the floor</span></h3>
                <div className="dwm__today">
                  <div className="dwm__ti"><div className="n">{k?.closureRequested ?? 0}</div><div className="k">Closures</div></div>
                  <div className="dwm__ti"><div className="n">{k?.inQc ?? 0}</div><div className="k">In QC</div></div>
                  <div className="dwm__ti"><div className="n">{k?.completedToday ?? 0}</div><div className="k">Done</div></div>
                </div>
              </div>

              {/* URGENT */}
              <div className="dw__c">
                <h3 className="dwm__ttl">Urgent Jobs <span className="dw__lbl">always visible</span></h3>
                {!stats || stats.urgent.length === 0 ? <div className="dw__empty">No urgent jobs.</div> : (
                  <div className="dwm__urg">{stats.urgent.map((u) => <button key={u.id} className="dwm__uc" onClick={() => openJob(u.id)}>{u.label}</button>)}</div>
                )}
              </div>

              {/* THROUGHPUT mini */}
              <div className="dw__c">
                <h3 className="dwm__ttl">Throughput <span className="dw__lbl">14d · {delta >= 0 ? '▲' : '▼'}{Math.abs(delta)}%</span></h3>
                <div className="dw__legend" style={{ marginTop: 6 }}><span><i style={{ background: '#84cc16' }} />Created</span><span><i style={{ background: '#15605a' }} />Closed</span></div>
                <svg width="100%" height="64" viewBox="0 0 300 64" preserveAspectRatio="none" style={{ marginTop: 6 }}>
                  <path d={linePath(tp.map((d) => d.created), 300, 64)} fill="none" stroke="#84cc16" strokeWidth="2.5" />
                  <path d={linePath(tp.map((d) => d.closed), 300, 64)} fill="none" stroke="#15605a" strokeWidth="2.5" />
                </svg>
              </div>
            </div>

            {/* RIGHT RAIL */}
            <aside className="dwm__rail">
              <div className="dw__c">
                <h3 className="dwm__ttl">Needs Attention <span className="dw__lbl">{stats?.attention.length ?? 0}</span></h3>
                <div className="dwm__att">
                  {!stats ? <div className="dw__empty">Loading…</div> : stats.attention.length === 0 ? <div className="dw__empty">✓ Nothing needs you.</div> : stats.attention.slice(0, 6).map((a) => (
                    <button key={a.kind + a.id} className="dwm__attr" onClick={() => openAttn(a)}>
                      <span className="dwm__ati" style={{ background: a.kind === 'ticket' ? '#e5503a' : '#e6962b' }} />
                      <span><div className="dwm__atm">{a.label}</div><div className="dwm__ats">{a.sub}</div></span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="dw__c">
                <h3 className="dwm__ttl">Admin Queue</h3>
                <div style={{ marginTop: 6 }}>
                  <div className="dwm__q"><span>PPC Requests<b>{k?.pendingPpc ?? 0}</b></span><button className="dwm__qb" onClick={() => setNav('ppc')}>Review</button></div>
                  <div className="dwm__q"><span>Closures<b>{k?.closureRequested ?? 0}</b></span><button className="dwm__qb" onClick={() => { setStatusFilter('close_requested'); setNav('jobs') }}>Sign off</button></div>
                  <div className="dwm__q"><span>Maintenance<b>{k?.openTickets ?? 0}</b></span><button className="dwm__qb" onClick={() => setPopup({ kind: 'maintenance' })}>Open</button></div>
                </div>
              </div>
              <div className="dw__c dwm__ask">
                <h3 className="dwm__ttl">✦ Ask GRYNX <span className="dw__lbl" style={{ color: '#a59e8e' }}>soon</span></h3>
                <p>"Which jobs are waiting for QC?"<br />"What should I review today?"<br />"Which department causes most holds?"</p>
              </div>
              <CalendarWidget onOpenJob={openJob} />
            </aside>
          </section>
        )}

        {nav === 'jobs' && (
          <section className="dw__view">
            <div className="dw__toolbar">
              <h1 className="dw__h1">Job Board</h1>
              <div className="dw__chiprow">
                {['active', 'in_production', 'in_qc', 'in_fg', 'close_requested', 'closed', 'all'].map((s) => (
                  <button key={s} className={`dw__fchip ${statusFilter === s ? 'is-on' : ''}`} onClick={() => setStatusFilter(s)}>{s === 'all' ? 'All' : s === 'active' ? 'Active' : STATUS_LABEL[s] ?? s}</button>
                ))}
              </div>
            </div>
            <div className="dw__tablewrap">
              <table className="dw__table">
                <thead><tr><th>Job ID</th><th>Product</th><th>Qty</th><th>Priority</th><th>Status</th><th>Started</th><th></th></tr></thead>
                <tbody>
                  {jobs === null ? <tr><td colSpan={7} className="dw__empty">Loading…</td></tr>
                    : filtered.length === 0 ? <tr><td colSpan={7} className="dw__empty">No jobs match.</td></tr>
                    : filtered.map((j) => (
                      <tr key={j.id} onClick={() => openJob(j.id)}>
                        <td className="dw__mono">{j.displayLabel}</td>
                        <td>{j.product?.name ?? '—'}</td>
                        <td>{j.totalQty}</td>
                        <td>{j.priority === 'urgent' ? <span className="dw__urgent">URGENT</span> : 'Normal'}</td>
                        <td><span className={`dw__st dw__st--${j.status}`}>{j.current ? `${j.current.department.name}` : STATUS_LABEL[j.status] ?? j.status}</span></td>
                        <td>{fmt(j.startDate ?? j.createdAt)}</td>
                        <td style={{ color: 'var(--ink3)' }}>Open ›</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {nav === 'ppc' && (
          <section className="dw__view">
            <div className="dw__toolbar"><h1 className="dw__h1">PPC Requests</h1><span className="dw__sub">{ppc?.length ?? 0} pending review</span></div>
            <div className="dw__cards">
              {ppc === null ? <div className="dw__empty">Loading…</div> : ppc.length === 0 ? <div className="dw__empty">No pending PPC requests.</div> : ppc.map((r) => {
                const qty = r.models.reduce((s, m) => s + m.quantity, 0)
                return (
                  <button key={r.id} className="dw__pcard" onClick={() => setPopup({ kind: 'review', req: r })}>
                    <span className="dw__pcard-no">{r.requestNo}{r.priority === 'urgent' && <span className="dw__urgent">URGENT</span>}</span>
                    <span className="dw__pcard-meta">{r.product.name} · {qty} units · {r.models.length} line{r.models.length > 1 ? 's' : ''}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
      </main>
     </div>

      {popup && (
        <div className="dw__overlay" onMouseDown={closePopup}>
          <div className={`dw__frame ${popup.kind === 'history' ? 'dw__frame--drawer' : (popup.kind === 'create' || popup.kind === 'review') ? 'dw__frame--wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
            <button className="dw__close" onClick={closePopup} aria-label="Close">×</button>
            {popup.kind === 'create' && <CreateJob user={user} onBack={closePopup} onLock={onLock} />}
            {popup.kind === 'review' && <PpcReviewSheet user={user} request={popup.req} mode="admin" onBack={closePopup} onLock={onLock} onDone={closePopup} />}
            {popup.kind === 'history' && <JobDetail user={user} jobId={popup.jobId} onBack={closePopup} onLock={onLock} />}
            {popup.kind === 'maintenance' && <Maintenance user={user} onBack={closePopup} onLock={onLock} onOpenTicket={(id) => setPopup({ kind: 'maintdetail', id })} />}
            {popup.kind === 'maintdetail' && <MaintenanceDetail user={user} ticketId={popup.id} onBack={() => setPopup({ kind: 'maintenance' })} onLock={onLock} />}
            {popup.kind === 'notifications' && <Notifications user={user} onBack={closePopup} onLock={onLock} onOpen={(n) => { if (n.jobId) setPopup({ kind: 'history', jobId: n.jobId }); else if (n.ticketId) setPopup({ kind: 'maintdetail', id: n.ticketId }); else closePopup() }} />}
          </div>
        </div>
      )}
    </div>
  )
}
