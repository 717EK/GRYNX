import { useEffect, useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { scan, newIdempotencyKey, lookupJob, type ScanResult, type JobDTO } from '../lib/api'
import './ScanPage.css'

type Phase = 'idle' | 'confirm' | 'result'
type Entry = 'camera' | 'manual'

// accept the Job ID (AT-N-050-080626-010) or the opaque code (Jxxxxxxxxxxx)
const CODE_RE = /^[A-Z0-9-]{6,40}$/

export default function ScanPage({
  user,
  onLock,
  onBack,
  stationName,
  stationDepartmentId,
  mode = 'advance',
  onLookup,
}: {
  user: SessionUser
  onLock: () => void
  onBack?: () => void
  /** Explicit station (View As / admin) — overrides the station derived from auth. */
  stationName?: string
  stationDepartmentId?: string
  /** 'advance' = floor scan that moves the job · 'lookup' = admin scans to view history. */
  mode?: 'advance' | 'lookup'
  onLookup?: (job: JobDTO) => void
}) {
  const [jobNo, setJobNo] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [entry, setEntry] = useState<Entry>('camera')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<ScanResult | null>(null)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)

  const clean = (s: string) => s.trim().toUpperCase().replace(/^GRYNX:/, '')

  async function check(rawNo: string) {
    const no = clean(rawNo)
    setError(null)
    if (!CODE_RE.test(no)) {
      setError('Not a valid job code')
      return
    }
    setBusy(true)
    try {
      // Admin lookup: resolve the code → full job history (no advance).
      if (mode === 'lookup') {
        const { job } = await lookupJob(no)
        onLookup?.(job)
        return
      }
      const { data } = await scan({ jobNo: no, idempotencyKey: newIdempotencyKey(), clientTs: new Date().toISOString(), preview: true, stationDepartmentId })
      setPreview(data)
      setPhase(data.result === 'applied' || data.result === 'forced' ? 'confirm' : 'result')
      if (data.result !== 'applied' && data.result !== 'forced') setResult(data)
    } catch {
      setError(mode === 'lookup' ? 'No job found for that code' : 'Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(force = false) {
    const no = clean(jobNo)
    setBusy(true)
    setError(null)
    try {
      const { data } = await scan({ jobNo: no, idempotencyKey: newIdempotencyKey(), clientTs: new Date().toISOString(), force, stationDepartmentId })
      setResult(data)
      setPhase('result')
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setJobNo('')
    setPreview(null)
    setResult(null)
    setError(null)
    setPhase('idle')
    setEntry('camera')
    setCamOn(true) // re-open the camera for the next scan
  }

  async function stopCamera() {
    try {
      await scannerRef.current?.stop()
    } catch {
      /* already stopped */
    }
    scannerRef.current = null
    setCamOn(false)
  }

  // Switch to manual code entry — kill the camera so it isn't running behind the form.
  function toManual() {
    void stopCamera()
    setError(null)
    setEntry('manual')
  }
  // Back to the live camera.
  function toCamera() {
    setError(null)
    setJobNo('')
    setEntry('camera')
    setCamOn(true)
  }

  // Mount the reader once #qr-reader is in the DOM (avoids racing the render).
  useEffect(() => {
    if (!camOn || scannerRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        const s = new Html5Qrcode('qr-reader')
        scannerRef.current = s
        await s.start(
          { facingMode: 'environment' },
          // no qrbox → html5-qrcode draws no overlay; our own .scan__frame is the
          // only viewfinder, so the corner markers stay aligned to the window
          { fps: 10 },
          async (decoded: string) => {
            await stopCamera()
            setJobNo(clean(decoded))
            check(decoded)
          },
          () => {},
        )
      } catch {
        // no camera (desktop / denied) → fall back to manual entry
        setCamOn(false)
        setEntry('manual')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn])

  // Open the camera straight away when the operator lands on Scan.
  useEffect(() => {
    setCamOn(true)
    return () => void stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const station = stationName ?? user.role

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body scan">
        <header className="scan__head">
          {onBack && (
            <button className="scan__back" onClick={onBack} aria-label="Back">←</button>
          )}
          <h1 className="scan__title display">{mode === 'lookup' ? 'History' : 'Scan'}</h1>
          <span className="scan__station mono-label">{mode === 'lookup' ? 'SCAN ANY CARD' : `STATION · ${station}`}</span>
        </header>

        {phase === 'idle' && entry === 'camera' && (
          <div className="scan__panel scan__panel--cam">
            <p className="scan__lead">
              {mode === 'lookup' ? (
                <>Scan a job card to pull up its <b>full history</b>.</>
              ) : (
                <>Point at the job card as it <b>arrives</b> at your station.</>
              )}
            </p>
            <div className="scan__camwrap">
              <div id="qr-reader" className="scan__reader" />
              <span className="scan__frame" aria-hidden />
            </div>
            <button className="scan__manual-link mono-label" onClick={toManual}>⌨ Enter code manually</button>
            {error && <span className="scan__err mono-label">{error}</span>}
          </div>
        )}

        {phase === 'idle' && entry === 'manual' && (
          // tapping the empty area (outside the form) returns to the camera
          <div className="scan__panel scan__panel--manual" onMouseDown={toCamera}>
            <button className="scan__camback mono-label" onClick={toCamera}>← Use camera</button>
            <div className="scan__manual-hero" onMouseDown={(e) => e.stopPropagation()}>
              <span className="scan__manual-k mono-label">Enter Job Code</span>
              <input
                className="scan__input"
                placeholder="AT-N-050-080626-010"
                value={jobNo}
                autoFocus
                onChange={(e) => setJobNo(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && check(jobNo)}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="btn btn--solid btn--block" disabled={busy || !jobNo} onClick={() => check(jobNo)}>
                {busy ? 'Checking…' : 'Check job'}
              </button>
              {error && <span className="scan__err mono-label">{error}</span>}
            </div>
          </div>
        )}

        {phase === 'confirm' && preview && (
          <div className="scan__panel scan__confirm">
            <span className="scan__label display">{preview.label}</span>
            <div className="scan__move">
              {preview.completes && (
                <span className="scan__from">completes <b>{preview.completes}</b></span>
              )}
              <span className="scan__arrow">↓</span>
              <span className="scan__to">now at <b>{preview.to}</b></span>
            </div>
            <button className="btn btn--solid btn--block" disabled={busy} onClick={() => confirm(false)}>
              {busy ? 'Recording…' : 'Confirm scan'}
            </button>
            <button className="btn btn--ghost btn--block" onClick={reset}>Cancel</button>
            {error && <span className="scan__err mono-label">{error}</span>}
          </div>
        )}

        {phase === 'result' && result && (
          <div className={`scan__panel scan__result is-${result.result}`}>
            <span className="scan__badge">{badge(result.result)}</span>
            <span className="scan__rlabel display">{result.label ?? clean(jobNo)}</span>
            <p className="scan__rmsg">{message(result)}</p>
            {result.result === 'rejected_out_of_seq' && (
              <button className="btn btn--ghost btn--block" disabled={busy} onClick={() => confirm(true)}>
                Force advance (supervisor)
              </button>
            )}
            <button className="btn btn--primary btn--block" onClick={reset}>Scan next</button>
          </div>
        )}
      </main>
      <BottomBar />
    </div>
  )
}

function badge(r: ScanResult['result']) {
  switch (r) {
    case 'applied': return '✓ ADVANCED'
    case 'forced': return '⚠ FORCED'
    case 'duplicate': return '• ALREADY HERE'
    case 'superseded': return '⟳ SUPERSEDED'
    case 'rejected_out_of_seq': return '✕ OUT OF SEQUENCE'
  }
}
function message(r: ScanResult) {
  switch (r.result) {
    case 'applied': return r.completed ? `Completed ${r.completed}. Now at ${r.station}.` : `Started at ${r.station}.`
    case 'forced': return `Forced to ${r.station}. Logged for review.`
    case 'duplicate': return 'This job is already in progress at your station — nothing to do.'
    case 'superseded': return 'Another scan already advanced this job. Nothing to do.'
    case 'rejected_out_of_seq': return r.hint ?? 'This job has not arrived at your station yet.'
  }
}
