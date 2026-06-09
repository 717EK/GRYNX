import { useEffect, useState } from 'react'
import { getJobCardHtml } from '../lib/api'
import './JobCardModal.css'

// Shows the printable job card inside the app (iframe), instead of a new tab.
// Print targets the iframe, so only the card prints — no app chrome.
export default function JobCardModal({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const [html, setHtml] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    getJobCardHtml(jobId)
      .then((h) => alive && setHtml(h))
      .catch(() => alive && setErr(true))
    return () => {
      alive = false
    }
  }, [jobId])

  function print() {
    const frame = document.getElementById('jobcard-frame') as HTMLIFrameElement | null
    frame?.contentWindow?.focus()
    frame?.contentWindow?.print()
  }

  return (
    <div className="jcm__overlay" onMouseDown={onClose}>
      <div className="jcm" onMouseDown={(e) => e.stopPropagation()}>
        <div className="jcm__head">
          <span className="mono-label">Job Card</span>
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
          <div className="jcm__err mono-label">Could not load the job card</div>
        ) : (
          <iframe
            id="jobcard-frame"
            className="jcm__frame"
            title="Job Card"
            srcDoc={html ?? '<p style="font-family:monospace;padding:24px;color:#666">Loading…</p>'}
          />
        )}
      </div>
    </div>
  )
}
