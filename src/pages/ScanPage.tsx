import { useEffect, useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { scan, newIdempotencyKey, type ScanResult } from '../lib/api'
import './ScanPage.css'

type Phase = 'idle' | 'confirm' | 'result'

// accept the Job ID (AT-N-050-080626-010) or the opaque code (Jxxxxxxxxxxx)
const CODE_RE = /^[A-Z0-9-]{6,40}$/

export default function ScanPage({
  user,
  onLock,
  onBack,
  stationName,
  stationDepartmentId,
}: {
  user: SessionUser
  onLock: () => void
  onBack?: () => void
  /** Explicit station (View As / admin) — overrides the station derived from auth. */
  stationName?: string
  stationDepartmentId?: string
}) {
  const [jobNo, setJobNo] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
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
      const { data } = await scan({ jobNo: no, idempotencyKey: newIdempotencyKey(), clientTs: new Date().toISOString(), preview: true, stationDepartmentId })
      setPreview(data)
      setPhase(data.result === 'applied' || data.result === 'forced' ? 'confirm' : 'result')
      if (data.result !== 'applied' && data.result !== 'forced') setResult(data)
    } catch {
      setError('Network error — try again')
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

  async function startCamera() {
    setError(null)
    setCamOn(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const s = new Html5Qrcode('qr-reader')
      scannerRef.current = s
      await s.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 230 },
        async (decoded: string) => {
          await stopCamera()
          setJobNo(clean(decoded))
          check(decoded)
        },
        () => {},
      )
    } catch {
      setError('Camera unavailable — enter the code manually')
      setCamOn(false)
    }
  }

  useEffect(() => () => void stopCamera(), [])

  const station = stationName ?? user.role

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body scan">
        <header className="scan__head">
          {onBack && (
            <button className="scan__back" onClick={onBack} aria-label="Back">←</button>
          )}
          <h1 className="scan__title display">Scan</h1>
          <span className="scan__station mono-label">STATION · {station}</span>
        </header>

        {phase === 'idle' && (
          <div className="scan__panel">
            <p className="scan__lead">Scan a job card as it <b>arrives</b> at your station.</p>

            {camOn ? (
              <div className="scan__cam">
                <div id="qr-reader" className="scan__reader" />
                <button className="btn btn--ghost" onClick={stopCamera}>Stop camera</button>
              </div>
            ) : (
              <button className="btn btn--solid btn--block scan__cambtn" onClick={startCamera}>
                <span>▣</span> Scan with camera
              </button>
            )}

            <div className="scan__or mono-label">or enter code</div>
            <div className="scan__manual">
              <input
                className="scan__input"
                placeholder="AT-N-050-080626-010"
                value={jobNo}
                onChange={(e) => setJobNo(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && check(jobNo)}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button className="btn btn--primary" disabled={busy || !jobNo} onClick={() => check(jobNo)}>
                {busy ? '…' : 'Check'}
              </button>
            </div>
            {error && <span className="scan__err mono-label">{error}</span>}
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
