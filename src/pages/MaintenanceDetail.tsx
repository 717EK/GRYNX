import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import {
  getMaintenance,
  maintenanceCrew,
  assignMaintenance,
  updateMaintenance,
  closeMaintenance,
  getUser,
  type MaintTicket,
  type MaintUserBrief,
} from '../lib/api'
import './MaintenanceDetail.css'

const STATUSES = ['open', 'assigned', 'in_progress', 'completed', 'verified', 'closed']
const FLOW = ['Open', 'Assigned', 'In Progress', 'Completed', 'Verified', 'Closed']
const EVENT_LABEL: Record<string, string> = { created: 'Reported', assigned: 'Assigned', update: 'Update', closed: 'Closed', note: 'Note' }
const catLabel = (c: string) => (c === 'it_network' ? 'IT / Network' : c.charAt(0).toUpperCase() + c.slice(1))
const fmt = (iso: string) => {
  const d = new Date(iso)
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  let h = d.getHours()
  const ap = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${p(d.getDate())} ${m[d.getMonth()]} ${h}:${p(d.getMinutes())} ${ap}`
}

type Mode = null | 'assign' | 'update' | 'close'

export default function MaintenanceDetail({
  user,
  ticketId,
  onBack,
  onLock,
}: {
  user: SessionUser
  ticketId: string | null
  onBack: () => void
  onLock: () => void
}) {
  const [ticket, setTicket] = useState<MaintTicket | null>(null)
  const [mode, setMode] = useState<Mode>(null)

  async function load() {
    if (!ticketId) return
    try {
      const { ticket } = await getMaintenance(ticketId)
      setTicket(ticket)
    } catch {
      setTicket(null)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  const me = getUser()
  const canManage = !!me?.roles.some((r) => r.role === 'admin' || r.role === 'maintenance')
  const isAssignee = !!me && ticket?.assignedToId === me.id
  const closed = ticket?.status === 'closed'
  const stage = ticket ? STATUSES.indexOf(ticket.status) : -1

  if (!ticket) {
    return (
      <div className="app">
        <TopBar user={user} onLock={onLock} />
        <main className="app__body screen">
          <header className="screen__head">
            <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
            <div className="screen__titles"><h1 className="screen__title display">Ticket</h1></div>
            <span />
          </header>
          <div className="screen__scroll"><span className="mnt__empty mono-label">Loading…</span></div>
        </main>
        <BottomBar />
      </div>
    )
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">{ticket.ticketNo}</h1>
            <span className="mono-label">{catLabel(ticket.category)} · {ticket.locationText}</span>
          </div>
          <span className={`pri-tag pri-tag--${ticket.priority} mono-label`}>{ticket.priority}</span>
        </header>

        <div className="screen__scroll">
          <div className="mdflow">
            {FLOW.map((f, i) => (
              <div key={f} className={`mdflow__step ${i < stage ? 'is-done' : ''} ${i === stage ? 'is-current' : ''}`}>
                <span className="mdflow__dot" />
                <span className="mdflow__label mono-label">{f}</span>
              </div>
            ))}
          </div>

          <div className="md__meta">
            <div className="jd__cell"><span className="mono-label">Location</span><span className="jd__cell-v display">{ticket.locationText}</span></div>
            <div className="jd__cell"><span className="mono-label">Category</span><span className="jd__cell-v display">{catLabel(ticket.category)}</span></div>
            <div className="jd__cell"><span className="mono-label">Reported</span><span className="jd__cell-v display">{ticket.reportedBy?.fullName ?? '—'}</span></div>
            <div className="jd__cell"><span className="mono-label">Assigned</span><span className="jd__cell-v display is-brand">{ticket.assignedTo?.fullName ?? 'Unassigned'}</span></div>
            {ticket.etaHours != null && <div className="jd__cell"><span className="mono-label">ETA</span><span className="jd__cell-v display">{ticket.etaHours} h</span></div>}
            {ticket.partsNeeded && <div className="jd__cell"><span className="mono-label">Parts</span><span className="jd__cell-v display">{ticket.partsNeeded}</span></div>}
          </div>

          <div className="md__desc">
            <span className="jd__section-title mono-label">Issue</span>
            <p className="md__desc-text">{ticket.description}</p>
            {ticket.photoUrl && (
              <a className="md__photo" href={ticket.photoUrl} target="_blank" rel="noreferrer" title="Open full size">
                <img src={ticket.photoUrl} alt="Reported issue" />
              </a>
            )}
          </div>

          {ticket.closeRemark && (
            <div className="md__desc">
              <span className="jd__section-title mono-label">Resolution</span>
              <p className="md__desc-text">{ticket.closeRemark}</p>
            </div>
          )}

          {!closed && (canManage || isAssignee) && (
            <div className="md__actions md__actions--row">
              {canManage && <button className="btn btn--primary" onClick={() => setMode('assign')}>{ticket.assignedToId ? 'Reassign' : 'Assign'}</button>}
              {(canManage || isAssignee) && <button className="btn btn--solid" onClick={() => setMode('update')}>Update</button>}
              {canManage && <button className="btn btn--danger" onClick={() => setMode('close')}>Close</button>}
            </div>
          )}

          <div className="jd__section">
            <span className="jd__section-title mono-label">Activity</span>
            <ol className="timeline">
              {[...(ticket.events ?? [])].reverse().map((e) => (
                <li className="tl" key={e.id}>
                  <span className="tl__dot" />
                  <span className="tl__body"><span className="tl__type">{EVENT_LABEL[e.type] ?? e.type}</span>{e.body ? ` — ${e.body}` : ''}</span>
                  <span className="tl__meta mono-label">{fmt(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
      <BottomBar />
      {mode && (
        <ActionModal
          mode={mode}
          ticket={ticket}
          onClose={() => setMode(null)}
          onDone={() => {
            setMode(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function ActionModal({ mode, ticket, onClose, onDone }: { mode: Exclude<Mode, null>; ticket: MaintTicket; onClose: () => void; onDone: () => void }) {
  const [crew, setCrew] = useState<MaintUserBrief[]>([])
  const [assignee, setAssignee] = useState(ticket.assignedToId ?? '')
  const [note, setNote] = useState('')
  const [eta, setEta] = useState(ticket.etaHours != null ? String(ticket.etaHours) : '')
  const [parts, setParts] = useState(ticket.partsNeeded ?? '')
  const [markComplete, setMarkComplete] = useState(false)
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'assign') maintenanceCrew().then((r) => setCrew(r.crew)).catch(() => setCrew([]))
  }, [mode])

  async function submit() {
    setErr(null)
    setBusy(true)
    try {
      if (mode === 'assign') {
        if (!assignee) throw new Error('pick')
        await assignMaintenance(ticket.id, assignee)
      } else if (mode === 'update') {
        await updateMaintenance(ticket.id, {
          note: note.trim() || undefined,
          etaHours: eta === '' ? undefined : Number(eta),
          partsNeeded: parts.trim() || undefined,
          status: markComplete ? 'completed' : undefined,
        })
      } else {
        if (!remark.trim()) throw new Error('remark')
        await closeMaintenance(ticket.id, remark.trim())
      }
      onDone()
    } catch (e) {
      setErr(e instanceof Error && e.message === 'pick' ? 'Pick a technician' : e instanceof Error && e.message === 'remark' ? 'A closing remark is required' : 'Action failed — try again')
      setBusy(false)
    }
  }

  const title = mode === 'assign' ? 'Assign Technician' : mode === 'update' ? 'Post Update' : 'Close Ticket'

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">{title}</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {mode === 'assign' && (
          <label className="mnt__field">
            <span className="mono-label">Technician</span>
            <select className="mnt__select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Select…</option>
              {crew.map((c) => (
                <option key={c.id} value={c.id}>{c.fullName}</option>
              ))}
            </select>
          </label>
        )}

        {mode === 'update' && (
          <>
            <label className="mnt__field"><span className="mono-label">Note (what you found / did)</span>
              <textarea className="mnt__textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Inspected — bearing worn" /></label>
            <div className="mnt__row2">
              <label className="mnt__field"><span className="mono-label">ETA (hours)</span>
                <input className="mnt__input" type="number" min={0} value={eta} onChange={(e) => setEta(e.target.value)} placeholder="e.g. 6" /></label>
              <label className="mnt__field"><span className="mono-label">Parts needed</span>
                <input className="mnt__input" value={parts} onChange={(e) => setParts(e.target.value)} placeholder="e.g. SKF-6206" /></label>
            </div>
            <label className="mnt__check"><input type="checkbox" checked={markComplete} onChange={(e) => setMarkComplete(e.target.checked)} /> Mark work completed</label>
          </>
        )}

        {mode === 'close' && (
          <label className="mnt__field"><span className="mono-label">Closing remark (required)</span>
            <textarea className="mnt__textarea" rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="What was done to fix it" /></label>
        )}

        {err && <span className="mnt__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : title}
        </button>
      </div>
    </div>
  )
}
