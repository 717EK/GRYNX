import { useEffect, useMemo, useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import JobForm, { type JobFormSelection } from '../components/JobForm'
import type { Option } from '../components/CustomSelect'
import { getProducts, createJob, getJobCardHtml, ApiError, type ProductDTO, type JobDTO } from '../lib/api'

export default function CreateJob({
  user,
  onBack,
  onLock,
  onOpenPpc,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpenPpc: () => void
}) {
  const [catalogue, setCatalogue] = useState<ProductDTO[] | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [created, setCreated] = useState<JobDTO | null>(null)
  const sel = useRef<JobFormSelection | null>(null)

  useEffect(() => {
    getProducts()
      .then((r) => setCatalogue(r.products))
      .catch(() => setLoadErr('Could not load the product catalogue'))
  }, [])

  const products: Option[] = useMemo(
    () => (catalogue ?? []).map((p) => ({ value: p.code, label: p.name, desc: p.description ?? undefined })),
    [catalogue],
  )
  const modelsByProduct = useMemo(
    () => Object.fromEntries((catalogue ?? []).map((p) => [p.code, p.models.map((m) => m.code)])),
    [catalogue],
  )

  async function openCard(jobId: string) {
    try {
      const html = await getJobCardHtml(jobId)
      const w = window.open('', '_blank')
      if (w) {
        w.document.open()
        w.document.write(html)
        w.document.close()
      }
    } catch {
      /* card can be reprinted from the job later */
    }
  }

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
      .map((m) => ({ modelId: product.models.find((x) => x.code === m.code)?.id, quantity: m.qty }))
      .filter((m): m is { modelId: string; quantity: number } => !!m.modelId && m.quantity > 0)
    if (models.length === 0) {
      setErr('Add at least one catalogue model with a quantity')
      return
    }
    const startDate = s.startDate ? new Date(`${s.startDate}T${s.startTime || '09:00'}`).toISOString() : undefined

    setBusy(true)
    try {
      const { job } = await createJob({ productId: product.id, priority: s.priority, models, startDate })
      setCreated(job)
      void openCard(job.id)
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
            <h1 className="jobscreen__title display">Create Job</h1>
            <span className="mono-label">Create a new production job</span>
          </div>
          <button className="jobscreen__pill" onClick={onOpenPpc} title="Pending PPC requests">
            <span className="jobscreen__pill-n display">02</span>
            <span className="mono-label">PPC →</span>
          </button>
        </header>

        <div className="jobscreen__scroll">
          {created ? (
            <div className="jobdone">
              <span className="jobdone__badge mono-label">✓ JOB CREATED</span>
              <span className="jobdone__label display">{created.displayLabel}</span>
              <span className="jobdone__id mono-label">ID {created.jobNo}</span>
              <p className="jobdone__hint">The job card opened in a new tab to print. The first department has been notified.</p>
              <div className="jobscreen__actions">
                <button className="btn btn--solid btn--block" onClick={() => void openCard(created.id)}>
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
                modelsByProduct={modelsByProduct}
                onChange={(s) => {
                  sel.current = s
                }}
              />
              <div className="jobscreen__actions">
                <button className="btn btn--solid btn--block" disabled={busy} onClick={submit}>
                  <span>📄</span> {busy ? 'Creating…' : 'Create Job'}
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
    </div>
  )
}
