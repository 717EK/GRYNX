import { useEffect, useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { listMaintenance, raiseMaintenance, type MaintTicket } from '../lib/api'
import { compressImage } from '../lib/image'
import './Maintenance.css'

const CATEGORIES = [
  ['mechanical', 'Mechanical'],
  ['electrical', 'Electrical'],
  ['utility', 'Utility'],
  ['facility', 'Facility'],
  ['it_network', 'IT / Network'],
  ['safety', 'Safety'],
  ['other', 'Other'],
] as const
const PRIORITIES = ['critical', 'high', 'normal', 'low'] as const
const CAT_LABEL = Object.fromEntries(CATEGORIES) as Record<string, string>
const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  closed: 'Closed',
}

export default function Maintenance({
  user,
  onBack,
  onLock,
  onOpenTicket,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenTicket: (id: string) => void
}) {
  const [tickets, setTickets] = useState<MaintTicket[] | null>(null)
  const [raising, setRaising] = useState(false)

  async function load() {
    try {
      const { tickets } = await listMaintenance()
      setTickets(tickets)
    } catch {
      setTickets([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const open = tickets?.filter((t) => t.status === 'open').length ?? 0
  const inProg = tickets?.filter((t) => t.status === 'in_progress').length ?? 0
  const assigned = tickets?.filter((t) => t.status === 'assigned').length ?? 0
  const closed = tickets?.filter((t) => t.status === 'closed').length ?? 0
  const active = tickets?.filter((t) => t.status !== 'closed') ?? []

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="screen__titles">
            <h1 className="screen__title display">Maintenance</h1>
            <span className="mono-label">Maintain. Repair. Optimize.</span>
          </div>
          <button className="mnt__report btn btn--solid" onClick={() => setRaising(true)}>
            + Report
          </button>
        </header>

        <div className="screen__scroll">
          <div className="mnt__summary">
            <Stat k="Open" v={open} />
            <Stat k="In Progress" v={inProg} warning />
            <Stat k="Assigned" v={assigned} />
            <Stat k="Closed" v={closed} />
          </div>

          <div className="mnt__list">
            {tickets === null ? (
              <span className="mnt__empty mono-label">Loading…</span>
            ) : active.length === 0 ? (
              <span className="mnt__empty mono-label">No open tickets. Tap “+ Report” to raise one.</span>
            ) : (
              active.map((t) => (
                <button key={t.id} className="ticket" onClick={() => onOpenTicket(t.id)}>
                  <span className="ticket__lead">
                    <span className={`pri pri--${t.priority}`} />
                    <span className="ticket__main">
                      <span className="ticket__loc">{t.locationText}</span>
                      <span className="ticket__meta mono-label">
                        {t.ticketNo} · {CAT_LABEL[t.category] ?? t.category} · {t.assignedTo?.fullName ?? 'Unassigned'}
                      </span>
                    </span>
                  </span>
                  <span className="ticket__right">
                    <span className={`pri-tag pri-tag--${t.priority} mono-label`}>{t.priority}</span>
                    <span className={`status status--${t.status} mono-label`}>
                      <span className="status__dot" />
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </main>
      <BottomBar />
      {raising && (
        <RaiseModal
          onClose={() => setRaising(false)}
          onDone={() => {
            setRaising(false)
            void load()
          }}
        />
      )}
    </div>
  )
}

function Stat({ k, v, warning }: { k: string; v: number; warning?: boolean }) {
  return (
    <div className="mnt__stat">
      <span className={`mnt__stat-v display ${warning && v > 0 ? 'is-warning' : ''}`}>{String(v).padStart(2, '0')}</span>
      <span className="mnt__stat-k mono-label">{k}</span>
    </div>
  )
}

function RaiseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [category, setCategory] = useState('mechanical')
  const [priority, setPriority] = useState('normal')
  const [locationText, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setPhotoBusy(true)
    setErr(null)
    try {
      setPhoto(await compressImage(file))
    } catch {
      setErr('Could not read that image')
    } finally {
      setPhotoBusy(false)
    }
  }

  async function submit() {
    if (!locationText.trim() || !description.trim()) {
      setErr('Add a location and what’s wrong')
      return
    }
    setBusy(true)
    try {
      await raiseMaintenance({ category, priority, locationText: locationText.trim(), description: description.trim(), photo: photo ?? undefined })
      onDone()
    } catch {
      setErr('Could not raise the ticket')
      setBusy(false)
    }
  }

  return (
    <div className="mnt__overlay" onMouseDown={onClose}>
      <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mnt__modal-head">
          <span className="display mnt__modal-title">Report an Issue</span>
          <button className="modal__x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label className="mnt__field">
          <span className="mono-label">Category</span>
          <select className="mnt__select" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="mnt__field">
          <span className="mono-label">Priority</span>
          <div className="mnt__prio">
            {PRIORITIES.map((p) => (
              <button key={p} className={`mnt__prio-opt pri-tag--${p} ${priority === p ? 'is-sel' : ''}`} onClick={() => setPriority(p)}>
                {p}
              </button>
            ))}
          </div>
        </label>
        <label className="mnt__field">
          <span className="mono-label">Location / Machine</span>
          <input className="mnt__input" placeholder="e.g. CNC #3 — spindle" value={locationText} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="mnt__field">
          <span className="mono-label">What’s wrong?</span>
          <textarea className="mnt__textarea" rows={3} placeholder="Describe the issue" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="mnt__field">
          <span className="mono-label">Photo (optional)</span>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
          {photo ? (
            <div className="mnt__photo">
              <img src={photo} alt="Issue" className="mnt__photo-img" />
              <div className="mnt__photo-actions">
                <button className="mnt__photo-btn" onClick={() => fileRef.current?.click()}>Retake</button>
                <button className="mnt__photo-btn mnt__photo-btn--del" onClick={() => setPhoto(null)}>Remove</button>
              </div>
            </div>
          ) : (
            <button className="mnt__photo-add" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? 'Processing…' : '📷 Add a photo of the issue'}
            </button>
          )}
        </div>
        {err && <span className="mnt__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>
          {busy ? 'Reporting…' : 'Raise Ticket'}
        </button>
      </div>
    </div>
  )
}
