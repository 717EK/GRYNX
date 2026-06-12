import { useEffect, useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm, { type JobFormSelection } from '../components/JobForm'
import JobCardModal from '../components/JobCardModal'
import ReportButton from '../components/ReportButton'
import { useCatalogue } from '../lib/useCatalogue'
import { createJob, createPpcRequest, getSaleSheets, ApiError, type JobDTO, type SaleSheet } from '../lib/api'

// Same form, two entry points — only the header + bottom action differ.
// 'job' = admin creates a job directly · 'ppc' = PPC raises a planning request
// (which an admin later reviews & approves in PpcReviewSheet).
const VARIANTS = {
  job: { title: 'Create Job', sub: 'Create a new production job' },
  ppc: { title: 'PPC Request', sub: 'Raise a production planning request' },
} as const

export default function CreateJob({
  user,
  onBack,
  onLock,
  onOpenInbox,
  onOpenSheets,
  onClearSheet,
  sheet = null,
  variant = 'job',
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  /** PPC variant: jump to "My Requests" inbox. */
  onOpenInbox?: () => void
  /** PPC variant: open the Sale Sheets list (sheets from sales awaiting conversion). */
  onOpenSheets?: () => void
  /** PPC variant: clear the picked sheet (after converting / cancelling). */
  onClearSheet?: () => void
  /** PPC variant: the Sale Sheet being converted — pre-fills + links the request. */
  sheet?: SaleSheet | null
  variant?: 'job' | 'ppc'
}) {
  const isPpc = variant === 'ppc'
  const meta = VARIANTS[variant]
  const submitLabel = isPpc ? 'Submit Request' : 'Create Job'
  const { catalogue, products, modelCatalogue, err: catErr } = useCatalogue()
  const loadErr = catErr ? 'Could not load the product catalogue' : null
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState(sheet ? (sheet.orderName ?? `${sheet.customer} order`) : '')
  const [sheetCount, setSheetCount] = useState(0)
  useEffect(() => {
    if (!isPpc || !onOpenSheets) return
    getSaleSheets('submitted').then((r) => setSheetCount(r.sheets.length)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPpc])
  const [created, setCreated] = useState<JobDTO | null>(null)
  const [cardJobId, setCardJobId] = useState<string | null>(null)
  const sel = useRef<JobFormSelection | null>(null)

  // Create Job keeps an unsaved draft on this device, so leaving and coming back
  // doesn't lose what was being entered. PPC Request has its own data.
  const DRAFT_KEY = 'grynx-jobdraft'
  const [savedDraft] = useState<JobFormSelection | null>(() => {
    if (isPpc) return null
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    } catch {
      return null
    }
  })
  const onFormChange = (s: JobFormSelection) => {
    sel.current = s
    if (!isPpc) localStorage.setItem(DRAFT_KEY, JSON.stringify(s))
  }
  const clearDraft = () => !isPpc && localStorage.removeItem(DRAFT_KEY)

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
    const input = {
      productId: product.id,
      name: name.trim() || undefined,
      saleSheetId: isPpc && sheet ? sheet.id : undefined,
      priority: s.priority,
      models,
      startDate,
    }

    setBusy(true)
    try {
      if (isPpc) {
        const { request } = await createPpcRequest(input)
        // reuse the success card — a request has no job card, just an ID.
        setCreated({ id: request.id, jobNo: request.requestNo, displayLabel: request.requestNo, status: request.status } as JobDTO)
      } else {
        const { job } = await createJob(input)
        clearDraft()
        setCreated(job)
        setCardJobId(job.id) // open the card in-app
      }
    } catch (e) {
      setErr(e instanceof ApiError ? `Could not ${isPpc ? 'submit request' : 'create job'} (${e.message})` : `Could not ${isPpc ? 'submit request' : 'create job'}`)
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
            <h1 className="jobscreen__title display">{meta.title}</h1>
            <span className="mono-label">{meta.sub}</span>
          </div>
          {isPpc ? (
            <div className="jobscreen__head-actions">
              <ReportButton />
              {onOpenInbox && (
                <button className="jobscreen__pill" onClick={onOpenInbox} title="My requests">
                  <span className="mono-label">My Requests →</span>
                </button>
              )}
            </div>
          ) : (
            <span />
          )}
        </header>

        {/* sales handoff: sheets waiting to be converted into requests */}
        {isPpc && !sheet && !created && sheetCount > 0 && onOpenSheets && (
          <button className="cj__sheetbar mono-label" onClick={onOpenSheets}>
            ⎘ {sheetCount} sale sheet{sheetCount > 1 ? 's' : ''} from sales awaiting conversion
            <b>Convert →</b>
          </button>
        )}

        {isPpc && sheet && !created && (
          <div className="cj__sheetchip mono-label">
            ⎘ Converting <b>{sheet.sheetNo}</b> · {sheet.customer}
            {onClearSheet && <button className="cj__sheetchip-x" onClick={onClearSheet} title="Detach sheet">×</button>}
          </div>
        )}

        <div className="jobscreen__scroll">
          {created ? (
            <div className="jobdone">
              <span className="jobdone__badge mono-label">{isPpc ? '✓ REQUEST SUBMITTED' : '✓ JOB CREATED'}</span>
              <span className="jobdone__label display">{created.displayLabel}</span>
              <span className="jobdone__id mono-label">{isPpc ? 'REQUEST' : 'ID'} {created.jobNo}</span>
              <p className="jobdone__hint">
                {isPpc ? 'Sent to admin for review. You’ll be notified on approval or change request.' : 'The job card is ready to print. The first department has been notified.'}
              </p>
              <div className="jobscreen__actions">
                {!isPpc && (
                  <button className="btn btn--solid btn--block" onClick={() => setCardJobId(created.id)}>
                    ▦ Reprint job card
                  </button>
                )}
                <button
                  className="btn btn--primary btn--block"
                  onClick={() => {
                    // a converted sheet is consumed — detach it before the next request
                    if (isPpc && sheet && onClearSheet) return onClearSheet()
                    setCreated(null)
                    setErr(null)
                  }}
                >
                  + {isPpc ? 'Raise another' : 'Create another'}
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
                jobIdLabel={isPpc ? 'Request ID' : 'Job ID'}
                products={products}
                modelCatalogue={modelCatalogue}
                initial={savedDraft}
                onChange={onFormChange}
              />
              <label className="cj__name">
                <span className="mono-label">Order name <span style={{ opacity: 0.6 }}>· optional</span></span>
                <input
                  className="cj__name-input"
                  type="text"
                  maxLength={120}
                  placeholder="e.g. Dubai order — 1600 sqft stage"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="jobscreen__actions">
                <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>
                  <span>{isPpc ? '✓' : '📄'}</span> {busy ? 'Submitting…' : submitLabel}
                </button>
                {err ? (
                  <span className="jobscreen__note mono-label" style={{ color: 'var(--danger)' }}>
                    {err}
                  </span>
                ) : (
                  <span className="jobscreen__note mono-label">
                    {isPpc ? 'ⓘ Admin reviews and approves to create the job.' : 'ⓘ Job sheet with barcode generated on creation.'}
                  </span>
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
