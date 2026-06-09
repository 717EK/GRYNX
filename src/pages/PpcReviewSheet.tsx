import { useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm, { type JobFormSelection } from '../components/JobForm'
import JobCardModal from '../components/JobCardModal'
import { useCatalogue } from '../lib/useCatalogue'
import {
  approvePpcRequest,
  requestPpcChange,
  proposePpcEdit,
  confirmPpcRequest,
  resubmitPpcRequest,
  ApiError,
  type JobDTO,
  type PpcRequest,
  type CreateJobInput,
} from '../lib/api'
import './PpcReviewSheet.css'

const STATUS_META: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'Pending review', cls: 'prs__chip--review' },
  pending_confirm: { label: 'Awaiting your confirm', cls: 'prs__chip--wait' },
  clarification: { label: 'Changes requested', cls: 'prs__chip--rc' },
  approved: { label: 'Approved', cls: 'prs__chip--ok' },
}

// A PPC request shown as a read-only job sheet — review first, edit only if
// needed. mode='admin' → Approve / Request Change, Edit proposes changes back to
// PPC. mode='ppc' → confirm the admin's proposal, or fix & resubmit after an RC.
export default function PpcReviewSheet({
  user,
  request,
  mode,
  onBack,
  onLock,
  onDone,
}: {
  user: SessionUser
  request: PpcRequest
  mode: 'admin' | 'ppc'
  onBack: () => void
  onLock: () => void
  onDone: () => void
}) {
  const { catalogue } = useCatalogue()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rcOpen, setRcOpen] = useState(false)
  const [rcNote, setRcNote] = useState('')
  const [created, setCreated] = useState<JobDTO | null>(null)
  const [cardJobId, setCardJobId] = useState<string | null>(null)
  const sel = useRef<JobFormSelection | null>(null)

  const status = request.status
  const meta = STATUS_META[status] ?? { label: status, cls: 'prs__chip--review' }
  const totalQty = request.models.reduce((s, m) => s + m.quantity, 0)
  const isAdmin = mode === 'admin'
  // PPC can edit-to-resubmit on a clarification, or edit the admin's proposal.
  const canEdit = isAdmin ? status === 'submitted' : status === 'clarification' || status === 'pending_confirm'
  const editSubmitLabel = isAdmin ? 'Send to PPC' : 'Resubmit'

  const initial: JobFormSelection = {
    productCode: request.product.code,
    models: request.models.map((m) => ({ code: m.model.code, size: m.size ?? '', qty: m.quantity })),
    priority: request.priority === 'urgent' ? 'urgent' : 'normal',
    startDate: request.startDate ? request.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
    startTime: '09:00',
  }

  // Build the API payload from the edited form selection (codes → ids).
  function buildInput(): CreateJobInput | { error: string } {
    const s = sel.current
    if (!s || !catalogue) return { error: 'Form not ready' }
    const product = catalogue.find((p) => p.code === s.productCode)
    if (!product) return { error: 'Pick a catalogue product' }
    const models = s.models
      .map((m) => ({ modelId: product.models.find((x) => x.code === m.code)?.id, size: m.size || undefined, quantity: m.qty }))
      .filter((m): m is { modelId: string; size: string | undefined; quantity: number } => !!m.modelId && m.quantity > 0)
    if (models.length === 0) return { error: 'Add at least one model with a quantity' }
    const startDate = s.startDate ? new Date(`${s.startDate}T${s.startTime || '09:00'}`).toISOString() : undefined
    return { productId: product.id, priority: s.priority, models, startDate }
  }

  async function run(fn: () => Promise<void>, label: string) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof ApiError ? `${label} failed (${e.message})` : `${label} failed`)
    } finally {
      setBusy(false)
    }
  }

  const approve = () =>
    run(async () => {
      const { job } = await approvePpcRequest(request.id)
      setCreated(job)
      setCardJobId(job.id)
    }, 'Approve')

  const submitRc = () => {
    if (!rcNote.trim()) {
      setErr('Add a note so PPC knows what to change')
      return
    }
    return run(async () => {
      await requestPpcChange(request.id, rcNote.trim())
      onDone()
    }, 'Request change')
  }

  const confirm = () => run(async () => { await confirmPpcRequest(request.id); onDone() }, 'Confirm')

  const sendEdit = () => {
    const input = buildInput()
    if ('error' in input) {
      setErr(input.error)
      return
    }
    return run(async () => {
      if (isAdmin) await proposePpcEdit(request.id, input)
      else await resubmitPpcRequest(request.id, input)
      onDone()
    }, isAdmin ? 'Send to PPC' : 'Resubmit')
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobscreen">
        <header className="jobscreen__head">
          <button className="jobscreen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="jobscreen__titles">
            <h1 className="jobscreen__title display">
              {editing ? 'Edit Request' : 'PPC Request'}
              <span className="jobscreen__pr"> {request.requestNo}</span>
            </h1>
            <span className="mono-label">{editing ? 'Modify and send back to PPC' : request.product.name}</span>
          </div>
          {!editing && !created && canEdit ? (
            <button className="prs__edit mono-label" onClick={() => { setEditing(true); setErr(null) }}>✎ Edit</button>
          ) : (
            <span />
          )}
        </header>

        <div className="jobscreen__scroll">
          {created ? (
            <div className="jobdone">
              <span className="jobdone__badge mono-label">✓ JOB CREATED</span>
              <span className="jobdone__label display">{created.displayLabel}</span>
              <span className="jobdone__id mono-label">ID {created.jobNo}</span>
              <p className="jobdone__hint">The job card is ready to print. The first department has been notified.</p>
              <div className="jobscreen__actions">
                <button className="btn btn--solid btn--block" onClick={() => setCardJobId(created.id)}>▦ Reprint job card</button>
                <button className="btn btn--primary btn--block" onClick={onDone}>← Back to requests</button>
              </div>
            </div>
          ) : editing ? (
            <>
              {!catalogue ? (
                <span className="jobscreen__note mono-label">Loading catalogue…</span>
              ) : (
                <JobForm jobIdLabel="Job ID" initial={initial} onChange={(s) => (sel.current = s)} />
              )}
              <div className="jobscreen__actions jobscreen__actions--two">
                <button className="btn btn--solid btn--block" disabled={busy} onClick={sendEdit}>
                  {busy ? 'Sending…' : `→ ${editSubmitLabel}`}
                </button>
                <button className="btn btn--primary btn--block" onClick={() => { setEditing(false); setErr(null) }}>Cancel</button>
                {err && <span className="jobscreen__note mono-label" style={{ color: 'var(--danger)' }}>{err}</span>}
              </div>
            </>
          ) : (
            <>
              {/* ── read-only job sheet ── */}
              <div className="prs">
                <div className="prs__row prs__row--top">
                  <span className={`prs__chip mono-label ${meta.cls}`}>{meta.label}</span>
                  {request.priority === 'urgent' && <span className="prs__chip mono-label prs__chip--urgent">⚡ URGENT</span>}
                </div>

                {request.clarificationNote && (
                  <div className="prs__note">
                    <span className="mono-label prs__note-k">{status === 'pending_confirm' ? 'Admin proposed' : 'Change requested'}</span>
                    <span className="prs__note-t">{request.clarificationNote}</span>
                  </div>
                )}

                <div className="prs__sheet">
                  <div className="prs__sheet-head mono-label">
                    <span>Model</span>
                    <span>Size</span>
                    <span>Qty</span>
                  </div>
                  {request.models.map((m, i) => (
                    <div className="prs__line" key={i}>
                      <span className="prs__model display">{m.model.code}</span>
                      <span className="prs__size mono-label">{m.size || '—'}</span>
                      <span className="prs__qty display">{m.quantity}</span>
                    </div>
                  ))}
                  <div className="prs__line prs__line--total">
                    <span className="mono-label">Total</span>
                    <span />
                    <span className="prs__qty display">{totalQty}</span>
                  </div>
                </div>

                <div className="prs__meta">
                  <div className="prs__meta-cell">
                    <span className="mono-label prs__meta-k">Product</span>
                    <span className="prs__meta-v">{request.product.name}</span>
                  </div>
                  <div className="prs__meta-cell">
                    <span className="mono-label prs__meta-k">Lines</span>
                    <span className="prs__meta-v">{request.models.length}</span>
                  </div>
                  <div className="prs__meta-cell">
                    <span className="mono-label prs__meta-k">Start</span>
                    <span className="prs__meta-v">{request.startDate ? request.startDate.slice(0, 10) : '—'}</span>
                  </div>
                  <div className="prs__meta-cell">
                    <span className="mono-label prs__meta-k">Target</span>
                    <span className="prs__meta-v">{request.targetDate ? request.targetDate.slice(0, 10) : '—'}</span>
                  </div>
                </div>
              </div>

              {/* ── actions ── */}
              <div className={`jobscreen__actions ${isAdmin ? 'jobscreen__actions--two' : ''}`}>
                {isAdmin ? (
                  <>
                    <button className="btn btn--solid btn--block" disabled={busy} onClick={approve}>
                      {busy ? 'Working…' : '✓ Approve & Create Job'}
                    </button>
                    <button className="btn btn--danger btn--block" disabled={busy} onClick={() => setRcOpen(true)}>
                      ↩ Request Change
                    </button>
                  </>
                ) : status === 'pending_confirm' ? (
                  <button className="btn btn--solid btn--block" disabled={busy} onClick={confirm}>
                    {busy ? 'Working…' : '✓ Confirm changes'}
                  </button>
                ) : (
                  <button className="btn btn--solid btn--block" onClick={() => setEditing(true)}>✎ Edit & resubmit</button>
                )}
                {err && <span className="jobscreen__note mono-label" style={{ color: 'var(--danger)' }}>{err}</span>}
              </div>
            </>
          )}
        </div>
      </main>
      <BottomBar />

      {rcOpen && (
        <div className="mnt__overlay" onMouseDown={() => setRcOpen(false)}>
          <div className="mnt__modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mnt__modal-head">
              <span className="display mnt__modal-title">Request Change</span>
              <button className="modal__x" onClick={() => setRcOpen(false)} aria-label="Close">×</button>
            </div>
            <span className="mono-label" style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
              Tell PPC what needs to change on {request.requestNo}
            </span>
            <textarea
              className="mnt__input"
              rows={3}
              placeholder="e.g. Confirm quantity for AT500 — looks high"
              value={rcNote}
              onChange={(e) => setRcNote(e.target.value)}
            />
            {err && <span className="mnt__err mono-label">{err}</span>}
            <button className="btn btn--solid btn--block" disabled={busy} onClick={submitRc}>
              {busy ? 'Sending…' : '↩ Send back to PPC'}
            </button>
          </div>
        </div>
      )}

      {cardJobId && <JobCardModal jobId={cardJobId} onClose={() => setCardJobId(null)} />}
    </div>
  )
}
