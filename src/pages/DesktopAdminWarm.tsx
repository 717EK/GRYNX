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

  return (
    <div className="dw">
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
          <section className="dw__bento">
            {/* HERO */}
            <div className="dw__c dw__hero">
              <div className="dw__hero-main">
                <span className="dw__lbl">Floor status · live</span>
                <div className="dw__num" onClick={() => { setStatusFilter('active'); setNav('jobs') }}>{k?.active ?? '—'}<small>active jobs</small></div>
                <div className="dw__chips">
                  <button className="dw__chip" onClick={() => { setStatusFilter('in_production'); setNav('jobs') }}><b>{k?.inProduction ?? 0}</b>In Production</button>
                  <button className="dw__chip" onClick={() => { setStatusFilter('in_qc'); setNav('jobs') }}><b>{k?.inQc ?? 0}</b>In QC</button>
                  <button className="dw__chip" onClick={() => { setStatusFilter('in_fg'); setNav('jobs') }}><b>{k?.inFg ?? 0}</b>In FG Stock</button>
                  <span className="dw__chip"><b>{k?.unitsWip ?? 0}</b>units WIP</span>
                </div>
              </div>
              <div className="dw__spark">
                <span className="dw__delta" style={delta < 0 ? { background: 'rgba(229,80,58,.16)', color: '#a3271a' } : undefined}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% wk</span>
                <svg width="150" height="74" viewBox="0 0 150 74" style={{ marginTop: 10 }}>
                  <defs><linearGradient id="dwg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#84cc16" stopOpacity=".35" /><stop offset="1" stopColor="#84cc16" stopOpacity="0" /></linearGradient></defs>
                  <path d={linePath(tp.map((d) => d.created), 150, 74) + ' L150,74 L0,74 Z'} fill="url(#dwg)" stroke="none" />
                  <path d={linePath(tp.map((d) => d.created), 150, 74)} fill="none" stroke="#84cc16" strokeWidth="2.5" />
                </svg>
              </div>
            </div>

            {/* CALENDAR */}
            <CalendarWidget onOpenJob={openJob} />

            {/* KPI minis */}
            <div className="dw__c"><span className="dw__lbl">Completed today</span><div className="dw__kv">{k?.completedToday ?? '—'}</div><div className="dw__ksub">jobs closed today</div></div>
            <div className={`dw__c ${(k?.overdue ?? 0) > 0 ? 'alert' : ''}`}><span className="dw__lbl">Overdue (SLA)</span><div className="dw__kv">{k?.overdue ?? '—'}</div><div className="dw__ksub">past stage time</div></div>

            {/* THROUGHPUT */}
            <div className="dw__c dw__chart">
              <div className="dw__hd"><h3>Throughput — created vs closed</h3><span className="dw__lbl">14 days</span></div>
              <div className="dw__legend"><span><i style={{ background: '#84cc16' }} />Created</span><span><i style={{ background: '#15605a' }} />Closed</span></div>
              <svg width="100%" height="120" viewBox="0 0 560 120" preserveAspectRatio="none" style={{ marginTop: 8 }}>
                <path d={linePath(tp.map((d) => d.created), 560, 120)} fill="none" stroke="#84cc16" strokeWidth="2.5" />
                <path d={linePath(tp.map((d) => d.closed), 560, 120)} fill="none" stroke="#15605a" strokeWidth="2.5" />
              </svg>
            </div>

            {/* ATTENTION */}
            <div className="dw__c dw__attn">
              <div className="dw__hd"><h3>Needs attention</h3><span className="dw__lbl">{stats?.attention.length ?? 0}</span></div>
              <div style={{ marginTop: 10 }}>
                {!stats ? <div className="dw__empty">Loading…</div> : stats.attention.length === 0 ? <div className="dw__empty">✓ Nothing needs you.</div> : stats.attention.slice(0, 5).map((a) => (
                  <button key={a.kind + a.id} className="dw__arow" onClick={() => openAttn(a)}>
                    <span className={`dw__ai ${a.kind === 'ticket' ? 'r' : 'a'}`}>{a.kind === 'ticket' ? '⚠' : '◷'}</span>
                    <span><div className="dw__am">{a.label}</div><div className="dw__as">{a.sub}</div></span>
                    <span className="dw__ago">›</span>
                  </button>
                ))}
              </div>
            </div>

            {/* DEPT LOAD */}
            <div className="dw__c dw__chart">
              <div className="dw__hd"><h3>Department load</h3><span className="dw__lbl">jobs at station now</span></div>
              {!stats || stats.byDepartment.length === 0 ? <div className="dw__empty">No jobs at stations.</div> : (
                <div className="dw__bars">
                  {stats.byDepartment.slice(0, 6).map((d) => (
                    <div key={d.code} className="dw__bar" onClick={() => { setStatusFilter('active'); setNav('jobs') }}>
                      <span>{d.department}</span>
                      <span className="dw__bart"><span className="dw__barf" style={{ width: `${(d.count / maxDept) * 100}%` }} /></span>
                      <span className="dw__barn">{d.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* OPEN TICKETS */}
            <div className="dw__c kpi" onClick={() => setPopup({ kind: 'maintenance' })}><span className="dw__lbl">Open tickets</span><div className="dw__kv">{k?.openTickets ?? '—'}</div><div className="dw__ksub">maintenance · tap to open</div></div>
          </section>
        )}

        {nav === 'jobs' && (
          <section>
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
          <section>
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

      {popup && (
        <div className="dw__overlay" onMouseDown={closePopup}>
          <div className={`dw__frame ${popup.kind === 'history' ? 'dw__frame--drawer' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
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
