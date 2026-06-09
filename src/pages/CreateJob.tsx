import { useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm, { type JobFormSelection } from '../components/JobForm'
import JobCardModal from '../components/JobCardModal'
import { useCatalogue } from '../lib/useCatalogue'
import { createJob, ApiError, type JobDTO } from '../lib/api'

export default function CreateJob({
  user,
  onBack,
  onLock,
  onOpenPpc,
  variant = 'job',
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenPpc?: () => void
  /** 'job' = Create Job, 'ppc' = PPC Request (same form, different header). */
  variant?: 'job' | 'ppc'
}) {
  const isPpc = variant === 'ppc'
  const { catalogue, products, modelCatalogue, err: catErr } = useCatalogue()
  const loadErr = catErr ? 'Could not load the product catalogue' : null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<JobDTO | null>(null)
  const [cardJobId, setCardJobId] = useState<string | null>(null)
  const sel = useRef<JobFormSelection | null>(null)

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
            <h1 className="jobscreen__title display">{isPpc ? 'PPC Request' : 'Create Job'}</h1>
            <span className="mono-label">{isPpc ? 'Raise a production planning request' : 'Create a new production job'}</span>
          </div>
          {!isPpc && onOpenPpc && (
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
                onChange={(s) => {
                  sel.current = s
                }}
              />
              <div className="jobscreen__actions">
                <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>
                  <span>📄</span> {busy ? 'Submitting…' : isPpc ? 'Submit Request' : 'Create Job'}
                </button>
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
