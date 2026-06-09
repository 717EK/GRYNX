import { useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm, { type JobFormSelection } from '../components/JobForm'
import JobCardModal from '../components/JobCardModal'
import { useCatalogue } from '../lib/useCatalogue'
import { createJob, ApiError, type JobDTO } from '../lib/api'

// Same form, three entry points — only the header + bottom action differ.
const VARIANTS = {
  job: { title: 'Create Job', sub: 'Create a new production job' },
  ppc: { title: 'PPC Request', sub: 'Raise a production planning request' },
  review: { title: 'PPC Request Review', sub: 'Review PPC request and approve to create job' },
} as const

export default function CreateJob({
  user,
  onBack,
  onLock,
  onOpenPpc,
  onReject,
  variant = 'job',
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenPpc?: () => void
  onReject?: () => void
  /** 'job' = admin create · 'ppc' = PPC raises a request · 'review' = admin reviews/approves. */
  variant?: 'job' | 'ppc' | 'review'
}) {
  const isPpc = variant === 'ppc'
  const isReview = variant === 'review'
  const meta = VARIANTS[variant]
  const submitLabel = isReview ? 'Approve & Create Job' : isPpc ? 'Submit Request' : 'Create Job'
  const { catalogue, products, modelCatalogue, err: catErr } = useCatalogue()
  const loadErr = catErr ? 'Could not load the product catalogue' : null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<JobDTO | null>(null)
  const [cardJobId, setCardJobId] = useState<string | null>(null)
  const sel = useRef<JobFormSelection | null>(null)

  // Create Job keeps an unsaved draft on this device, so leaving and coming
  // back (e.g. peeking at PPC) doesn't lose what the admin was entering. PPC
  // Request / Review have their own data and don't use this draft.
  const DRAFT_KEY = 'grynx-jobdraft'
  const [initialDraft] = useState<JobFormSelection | null>(() => {
    if (variant !== 'job') return null
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    } catch {
      return null
    }
  })
  const onFormChange = (s: JobFormSelection) => {
    sel.current = s
    if (variant === 'job') localStorage.setItem(DRAFT_KEY, JSON.stringify(s))
  }
  const clearDraft = () => variant === 'job' && localStorage.removeItem(DRAFT_KEY)

  async function submit() {
    setErr(null)
    const s = sel.current
    if (!s || !catalogue) return
    const product = catalogue.find((p) => p.code === s.productCode)
    if (!product) {
      setErr('Custom products aren’t supported yet — pick one from the catalogue')
      return
    }
    const models = s.models
      .map((m) => ({ modelId: product.models.find((x) => x.code === m.code)?.id, size: m.size || undefined, quantity: m.qty }))
      .filter((m): m is { modelId: string; size: string | undefined; quantity: number } => !!m.modelId && m.quantity > 0)
    if (models.length === 0) {
      setErr('Add at least one catalogue model with a quantity')
      return
    }
    const startDate = s.startDate ? new Date(`${s.startDate}T${s.startTime || '09:00'}`).toISOString() : undefined

    setBusy(true)
    try {
      const { job } = await createJob({ productId: product.id, priority: s.priority, models, startDate })
      clearDraft() // job created → discard the saved draft
      setCreated(job)
      setCardJobId(job.id) // open the card in-app
    } catch (e) {
      setErr(e instanceof ApiError ? `Could not create job (${e.message})` : 'Could not create job')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body jobscreen">
        <header className="jobscreen__head">
          <button className="jobscreen__back" onClick={onBack} aria-label="Back">
            ←
          </button>
          <div className="jobscreen__titles">
            <h1 className="jobscreen__title display">
              {meta.title}
              {isReview && <span className="jobscreen__pr"> PR-0001</span>}
            </h1>
            <span className="mono-label">{meta.sub}</span>
          </div>
          {variant === 'job' && onOpenPpc && (
            <button className="jobscreen__pill" onClick={onOpenPpc} title="Pending PPC requests">
              <span className="jobscreen__pill-n display">02</span>
              <span className="mono-label">PPC →</span>
            </button>
          )}
        </header>

        <div className="jobscreen__scroll">
          {created ? (
            <div className="jobdone">
              <span className="jobdone__badge mono-label">{isPpc ? '✓ REQUEST SUBMITTED' : '✓ JOB CREATED'}</span>
              <span className="jobdone__label display">{created.displayLabel}</span>
              <span className="jobdone__id mono-label">ID {created.jobNo}</span>
              <p className="jobdone__hint">The job card is ready to print. The first department has been notified.</p>
              <div className="jobscreen__actions">
                <button className="btn btn--solid btn--block" onClick={() => setCardJobId(created.id)}>
                  ▦ Reprint job card
                </button>
                <button
                  className="btn btn--primary btn--block"
                  onClick={() => {
                    setCreated(null)
                    setErr(null)
                  }}
                >
                  + Create another
                </button>
              </div>
            </div>
          ) : loadErr ? (
            <div className="jobscreen__actions">
              <span className="jobscreen__note mono-label" style={{ color: 'var(--danger)' }}>
                {loadErr}
              </span>
            </div>
          ) : !catalogue ? (
            <div className="jobscreen__actions">
              <span className="jobscreen__note mono-label">Loading catalogue…</span>
            </div>
          ) : (
            <>
              <JobForm
                jobIdLabel="Job ID"
                products={products}
                modelCatalogue={modelCatalogue}
                initial={initialDraft}
                onChange={onFormChange}
              />
              <div className={`jobscreen__actions ${isReview ? 'jobscreen__actions--two' : ''}`}>
                <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>
                  <span>{isReview ? '✓' : '📄'}</span> {busy ? 'Submitting…' : submitLabel}
                </button>
                {isReview && (
                  <button className="btn btn--danger btn--block" onClick={onReject ?? onBack} title="Reject request">
                    Reject
                  </button>
                )}
                {err ? (
                  <span className="jobscreen__note mono-label" style={{ color: 'var(--danger)' }}>
                    {err}
                  </span>
                ) : (
                  <span className="jobscreen__note mono-label">ⓘ Job sheet with barcode generated on creation.</span>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <BottomBar />
      {cardJobId && <JobCardModal jobId={cardJobId} onClose={() => setCardJobId(null)} />}
    </div>
  )
}
