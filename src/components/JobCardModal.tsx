import { useEffect, useState } from 'react'
import { getJobCardHtml, getJobRecordHtml } from '../lib/api'
import './JobCardModal.css'

// Shows a printable document inside the app (iframe), instead of a new tab.
// Print targets the iframe, so only the document prints — no app chrome.
// variant: 'card' = the barcode job card · 'record' = the as-built production record.
export default function JobCardModal({
  jobId,
  onClose,
  variant = 'card',
}: {
  jobId: string
  onClose: () => void
  variant?: 'card' | 'record'
}) {
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    ;(variant === 'record' ? getJobRecordHtml(jobId) : getJobCardHtml(jobId))
      .then((h) => alive && setHtml(h))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [jobId, variant])

  function print() {
    const frame = document.getElementById('jobcard-frame') as HTMLIFrameElement | null
    frame?.contentWindow?.focus()
    frame?.contentWindow?.print()
  }

  return (
    <div className="jcm__overlay" onMouseDown={onClose}>
      <div className="jcm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="jcm__head">
          <span className="mono-label">{variant === 'record' ? 'Production Record' : 'Job Card'}</span>
          <div className="jcm__actions">
            <button className="btn btn--solid jcm__print" onClick={print} disabled={!html}>
              ▦ Print
            </button>
            <button className="modal__x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>
        {err ? (
          <div className="jcm__err mono-label">Could not load the {variant === 'record' ? 'production record' : 'job card'}</div>
        ) : (
          <iframe
            id="jobcard-frame"
            className="jcm__frame"
            title={variant === 'record' ? 'Production Record' : 'Job Card'}
            srcDoc={html ?? '<p style="font-family:monospace;padding:24px;color:#666">Loading…</p>'}
          />
        )}
      </div>
    </div>
  )
}
