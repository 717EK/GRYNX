import { useEffect, useState } from 'react'
import type { SessionUser } from '../components/UtilityBars'
import CreateJob from './CreateJob'
import PpcReviewSheet from './PpcReviewSheet'
import JobDetail from './JobDetail'
import Maintenance from './Maintenance'
import MaintenanceDetail from './MaintenanceDetail'
import Notifications from './Notifications'
import DesktopDashboard from './DesktopDashboard'
import { getJobs, listPpcRequests, notificationCount, type JobDTO, type PpcRequest } from '../lib/api'
import grynxWordmark from '../assets/grynx-wordmark.png'
import './DesktopAdmin.css'

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved', in_production: 'In Production', in_qc: 'In QC', in_fg: 'In FG Stock',
  close_requested: 'Closure Req.', closed: 'Closed', cancelled: 'Cancelled', draft: 'Draft', pending_approval: 'Pending',
}
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '—')

type Nav = 'dashboard' | 'jobs' | 'ppc'
type Popup =
  | null
  | { kind: 'create' }
  | { kind: 'review'; req: PpcRequest }
  | { kind: 'history'; jobId: string }
  | { kind: 'maintenance' }
  | { kind: 'maintdetail'; id: string }
  | { kind: 'notifications' }

// The single-page desktop admin panel: a live job board with everything else as
// popups/drawers over it. Reuses the existing mobile screens as popup bodies.
export default function DesktopAdmin({ user, onLock }: { user: SessionUser; onLock: () => void }) {
  const [nav, setNav] = useState<Nav>('dashboard')
  const [jobs, setJobs] = useState<JobDTO[] | null>(null)
  const [ppc, setPpc] = useState<PpcRequest[] | null>(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [q, setQ] = useState('')
  const [popup, setPopup] = useState<Popup>(null)
  const [unread, setUnread] = useState(0)

  function loadJobs() {
    getJobs().then((r) => setJobs(r.jobs)).catch(() => setJobs([]))
  }
  useEffect(() => {
    loadJobs()
    listPpcRequests('submitted').then((r) => setPpc(r.requests)).catch(() => setPpc([]))
    notificationCount().then((r) => setUnread(r.unread)).catch(() => {})
  }, [])
  // refresh the board whenever a popup closes (an action may have changed data)
  function closePopup() {
    setPopup(null)
    loadJobs()
    listPpcRequests('submitted').then((r) => setPpc(r.requests)).catch(() => {})
  }

  const filtered = (jobs ?? [])
    .filter((j) => (statusFilter === 'all' ? true : statusFilter === 'active' ? !['closed', 'cancelled', 'draft'].includes(j.status) : j.status === statusFilter))
    .filter((j) => !q || j.displayLabel.toLowerCase().includes(q.toLowerCase()) || (j.product?.name ?? '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="dk">
      {/* top bar */}
      <header className="dk__top">
        <img className="dk__logo" src={grynxWordmark} alt="GRYNX" />
        <span className="dk__tag mono">D-LYFT · ADMIN</span>
        <input className="dk__search" placeholder="Search jobs by ID or product…" value={q} onChange={(e) => { setQ(e.target.value); setNav('jobs') }} />
        <button className="dk__btn dk__btn--solid" onClick={() => setPopup({ kind: 'create' })}>+ Create Job</button>
        <button className="dk__icon" onClick={() => setPopup({ kind: 'notifications' })} title="Notifications">
          🔔{unread > 0 && <span className="dk__badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <span className="dk__user">{user.name}<small>{user.role} · {user.id}</small></span>
        <button className="dk__icon" onClick={onLock} title="Sign out">⏻</button>
      </header>

      <div className="dk__body">
        {/* left nav */}
        <nav className="dk__nav">
          <button className={`dk__navrow ${nav === 'dashboard' ? 'is-active' : ''}`} onClick={() => setNav('dashboard')}>Control Centre<span>◴</span></button>
          <button className={`dk__navrow ${nav === 'jobs' ? 'is-active' : ''}`} onClick={() => setNav('jobs')}>Job Board<span>{jobs?.length ?? ''}</span></button>
          <button className={`dk__navrow ${nav === 'ppc' ? 'is-active' : ''}`} onClick={() => setNav('ppc')}>PPC Requests<span>{ppc?.length ?? ''}</span></button>
          <button className="dk__navrow" onClick={() => setPopup({ kind: 'maintenance' })}>Maintenance<span>›</span></button>
          <div className="dk__nav-sp" />
          <button className="dk__navrow dk__navrow--ghost" onClick={() => setPopup({ kind: 'notifications' })}>Notifications</button>
        </nav>

        {/* center work surface */}
        <main className="dk__main">
          {nav === 'dashboard' ? (
            <DesktopDashboard onOpenBoard={() => setNav('jobs')} />
          ) : nav === 'jobs' ? (
            <>
              <div className="dk__toolbar">
                <h1 className="dk__h1">Job Board</h1>
                <div className="dk__filters">
                  {['active', 'in_production', 'in_qc', 'in_fg', 'close_requested', 'closed', 'all'].map((s) => (
                    <button key={s} className={`dk__chip ${statusFilter === s ? 'is-active' : ''}`} onClick={() => setStatusFilter(s)}>
                      {s === 'all' ? 'All' : s === 'active' ? 'Active' : STATUS_LABEL[s] ?? s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="dk__tablewrap">
                <table className="dk__table">
                  <thead><tr><th>Job ID</th><th>Product</th><th>Qty</th><th>Priority</th><th>Status</th><th>Started</th><th></th></tr></thead>
                  <tbody>
                    {jobs === null ? (
                      <tr><td colSpan={7} className="dk__empty">Loading…</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={7} className="dk__empty">No jobs match.</td></tr>
                    ) : filtered.map((j) => (
                      <tr key={j.id} onClick={() => setPopup({ kind: 'history', jobId: j.id })}>
                        <td className="dk__mono">{j.displayLabel}</td>
                        <td>{j.product?.name ?? '—'}</td>
                        <td>{j.totalQty}</td>
                        <td>{j.priority === 'urgent' ? <span className="dk__urgent">URGENT</span> : 'Normal'}</td>
                        <td><span className={`dk__status dk__status--${j.status}`}>{STATUS_LABEL[j.status] ?? j.status}</span></td>
                        <td>{fmt(j.startDate ?? j.createdAt)}</td>
                        <td className="dk__open">Open ›</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div className="dk__toolbar"><h1 className="dk__h1">PPC Requests</h1><span className="dk__sub">{ppc?.length ?? 0} pending review</span></div>
              <div className="dk__cards">
                {ppc === null ? <div className="dk__empty">Loading…</div> : ppc.length === 0 ? <div className="dk__empty">No pending PPC requests.</div> : ppc.map((r) => {
                  const qty = r.models.reduce((s, m) => s + m.quantity, 0)
                  return (
                    <button key={r.id} className="dk__card" onClick={() => setPopup({ kind: 'review', req: r })}>
                      <span className="dk__card-no">{r.requestNo}{r.priority === 'urgent' && <span className="dk__urgent">URGENT</span>}</span>
                      <span className="dk__card-meta">{r.product.name} · {qty} units · {r.models.length} line{r.models.length > 1 ? 's' : ''}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </main>
      </div>

      {/* popups — reuse the mobile screens inside a centred phone-frame */}
      {popup && (
        <div className="dk__overlay" onMouseDown={closePopup}>
          <div className={`dk__frame ${popup.kind === 'history' ? 'dk__frame--drawer' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
            <button className="dk__close" onClick={closePopup} aria-label="Close">×</button>
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
