import { useEffect, useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { scan, newIdempotencyKey, lookupJob, getStations, type ScanResult, type JobDTO, type Station } from '../lib/api'
import { enqueueScan, onScanQueueChange } from '../lib/scanQueue'
import './ScanPage.css'

type Phase = 'idle' | 'station-out' | 'station-in' | 'result' | 'queued'
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
  stationScan = false,
  onLookup,
}: {
  user: SessionUser
  onLock: () => void
  onBack?: () => void
  stationName?: string
  stationDepartmentId?: string
  mode?: 'advance' | 'lookup'
  /** Production floor: pick a station and scan-in / scan-out (StationVisit). */
  stationScan?: boolean
  onLookup?: (job: JobDTO) => void
}) {
  const [jobNo, setJobNo] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [entry, setEntry] = useState<Entry>('camera')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [camOn, setCamOn] = useState(false)
  const [queuedN, setQueuedN] = useState(0)
  // station mode
  const [stations, setStations] = useState<Station[]>([])
  const [stationId, setStationId] = useState<string>('')
  const [remark, setRemark] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [parallel, setParallel] = useState(false)
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null)

  useEffect(() => onScanQueueChange(setQueuedN), [])
  useEffect(() => {
    if (!stationScan) return
    getStations().then((r) => setStations(r.stations)).catch(() => {})
  }, [stationScan])

  const clean = (s: string) => s.trim().toUpperCase().replace(/^GRYNX:/, '')
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false
  const selStation = stations.find((s) => s.id === stationId)

  function queueIt(no: string, extra?: { remark?: string; photoUrl?: string }) {
    enqueueScan({ jobNo: no, stationDepartmentId, stationId: stationScan ? stationId : undefined, parallel, remark: extra?.remark, photoUrl: extra?.photoUrl })
    setJobNo(no)
    setPhase('queued')
  }

  // a job code was captured (camera or manual)
  async function onCode(rawNo: string) {
    const no = clean(rawNo)
    setError(null)
    if (!CODE_RE.test(no)) return setError('Not a valid job code')
    setJobNo(no)

    if (mode === 'lookup') {
      setBusy(true)
      try {
        const { job } = await lookupJob(no)
        onLookup?.(job)
      } catch {
        setError('No job found for that code')
      } finally {
        setBusy(false)
      }
      return
    }

    // STATION scan — preview tells us whether this opens (in) or closes (out) a visit
    if (stationScan) {
      if (!stationId) return setError('Pick your station first')
      if (offline()) return queueIt(no)
      setBusy(true)
      try {
        const { data } = await scan({ jobNo: no, idempotencyKey: newIdempotencyKey(), clientTs: new Date().toISOString(), stationId, preview: true })
        if (data.result !== 'applied') {
          setResult(data)
          setPhase('result')
        } else {
          setRemark('')
          setPhotoUrl(undefined)
          setParallel(false)
          setPhase(data.action === 'out' ? 'station-out' : 'station-in')
        }
      } catch {
        queueIt(no)
      } finally {
        setBusy(false)
      }
      return
    }

    // GATE scan (Design / QC / FG) — advance directly
    if (offline()) return queueIt(no)
    setBusy(true)
    try {
      const { data } = await scan({ jobNo: no, idempotencyKey: newIdempotencyKey(), clientTs: new Date().toISOString(), stationDepartmentId })
      setResult(data)
      setPhase('result')
    } catch {
      queueIt(no)
    } finally {
      setBusy(false)
    }
  }

  // confirm a station scan-in / scan-out
  async function confirmStation(action: 'in' | 'out') {
    const no = clean(jobNo)
    if (offline()) return queueIt(no, { remark: action === 'out' ? remark : undefined, photoUrl: action === 'out' ? photoUrl : undefined })
    setBusy(true)
    setError(null)
    try {
      const { data } = await scan({
        jobNo: no,
        idempotencyKey: newIdempotencyKey(),
        clientTs: new Date().toISOString(),
        stationId,
        parallel: action === 'in' ? parallel : undefined,
        remark: action === 'out' ? remark || undefined : undefined,
        photoUrl: action === 'out' ? photoUrl : undefined,
      })
      setResult(data)
      setPhase('result')
    } catch {
      queueIt(no, { remark: action === 'out' ? remark : undefined, photoUrl: action === 'out' ? photoUrl : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function onPhoto(file: File) {
    // compress to a small JPEG data URL via canvas
    const img = new Image()
    const url = URL.createObjectURL(file)
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    const max = 1000
    const scaleF = Math.min(1, max / Math.max(img.width, img.height))
    const cv = document.createElement('canvas')
    cv.width = Math.round(img.width * scaleF)
    cv.height = Math.round(img.height * scaleF)
    cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height)
    URL.revokeObjectURL(url)
    setPhotoUrl(cv.toDataURL('image/jpeg', 0.7))
  }

  function reset() {
    setJobNo('')
    setResult(null)
    setError(null)
    setRemark('')
    setPhotoUrl(undefined)
    setParallel(false)
    setPhase('idle')
    setEntry('camera')
    setCamOn(true)
  }

  async function stopCamera() {
    try { await scannerRef.current?.stop() } catch { /* already stopped */ }
    scannerRef.current = null
    setCamOn(false)
  }
  function toManual() { void stopCamera(); setError(null); setEntry('manual') }
  function toCamera() { setError(null); setJobNo(''); setEntry('camera'); setCamOn(true) }

  useEffect(() => {
    if (!camOn || scannerRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        const s = new Html5Qrcode('qr-reader')
        scannerRef.current = s
        await s.start({ facingMode: 'environment' }, { fps: 10 }, async (decoded: string) => {
          await stopCamera()
          onCode(decoded)
        }, () => {})
      } catch {
        setCamOn(false)
        setEntry('manual')
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn])

  useEffect(() => {
    setCamOn(true)
    return () => void stopCamera()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const station = stationName ?? (stationScan ? (selStation?.name ?? 'Production') : user.role)

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body scan">
        <header className="scan__head">
          {onBack && <button className="scan__back" onClick={onBack} aria-label="Back">←</button>}
          <h1 className="scan__title display">{mode === 'lookup' ? 'History' : 'Scan'}</h1>
          <span className="scan__station mono-label">{mode === 'lookup' ? 'SCAN ANY CARD' : `STATION · ${station}`}</span>
        </header>

        {mode === 'advance' && queuedN > 0 && (
          <div className="scan__queued-bar mono-label">⟳ {queuedN} scan{queuedN > 1 ? 's' : ''} queued — syncing when online</div>
        )}

        {/* station picker (production floor) */}
        {stationScan && phase === 'idle' && (
          <div className="scan__stations">
            {stations.map((s) => (
              <button key={s.id} className={`scan__stchip ${stationId === s.id ? 'is-on' : ''}`} onClick={() => setStationId(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        )}

        {phase === 'idle' && entry === 'camera' && (
          <div className="scan__panel scan__panel--cam">
            <p className="scan__lead">
              {mode === 'lookup'
                ? <>Scan a job card to pull up its <b>full history</b>.</>
                : stationScan
                  ? <>Scan a job to <b>check in / out</b>{selStation ? <> at <b>{selStation.name}</b></> : <> — pick your station above</>}.</>
                  : <>Point at the job card as it <b>arrives</b> at your station.</>}
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
                onKeyDown={(e) => e.key === 'Enter' && onCode(jobNo)}
                autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              />
              <button className="btn btn--solid btn--block" disabled={busy || !jobNo} onClick={() => onCode(jobNo)}>
                {busy ? 'Checking…' : 'Check job'}
              </button>
              {error && <span className="scan__err mono-label">{error}</span>}
            </div>
          </div>
        )}

        {phase === 'queued' && (
          <div className="scan__panel scan__result is-applied">
            <span className="scan__badge">⟳ SAVED OFFLINE</span>
            <span className="scan__rlabel display">{clean(jobNo)}</span>
            <p className="scan__rmsg">No connection — saved on the device, will sync automatically when you’re back online.</p>
            <button className="btn btn--primary btn--block" onClick={reset}>Scan next</button>
          </div>
        )}

        {/* station scan-IN confirm */}
        {phase === 'station-in' && (
          <div className="scan__panel scan__confirm">
            <span className="scan__label display">{clean(jobNo)}</span>
            <div className="scan__move"><span className="scan__to">check <b>IN</b> at <b>{selStation?.name}</b></span></div>
            <label className="scan__check mono-label">
              <input type="checkbox" checked={parallel} onChange={(e) => setParallel(e.target.checked)} />
              also running at another station (parallel)
            </label>
            <button className="btn btn--solid btn--block" disabled={busy} onClick={() => confirmStation('in')}>{busy ? 'Recording…' : 'Scan in'}</button>
            <button className="btn btn--ghost btn--block" onClick={reset}>Cancel</button>
            {error && <span className="scan__err mono-label">{error}</span>}
          </div>
        )}

        {/* station scan-OUT confirm (remark + photo) */}
        {phase === 'station-out' && (
          <div className="scan__panel scan__confirm">
            <span className="scan__label display">{clean(jobNo)}</span>
            <div className="scan__move"><span className="scan__to">check <b>OUT</b> of <b>{selStation?.name}</b></span></div>
            <textarea className="scan__remark" placeholder="What was done here? (optional)" value={remark} maxLength={500} onChange={(e) => setRemark(e.target.value)} />
            <label className="scan__photo mono-label">
              {photoUrl ? <img src={photoUrl} className="scan__photo-thumb" alt="" /> : '📷 Add photo (optional)'}
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
            </label>
            <button className="btn btn--solid btn--block" disabled={busy} onClick={() => confirmStation('out')}>{busy ? 'Recording…' : 'Scan out'}</button>
            <button className="btn btn--ghost btn--block" onClick={reset}>Cancel</button>
            {error && <span className="scan__err mono-label">{error}</span>}
          </div>
        )}

        {phase === 'result' && result && (
          <div className={`scan__panel scan__result is-${result.result}`}>
            <span className="scan__badge">{badge(result)}</span>
            <span className="scan__rlabel display">{result.label ?? clean(jobNo)}</span>
            <p className="scan__rmsg">{message(result, selStation?.name)}</p>
            <button className="btn btn--primary btn--block" onClick={reset}>Scan next</button>
          </div>
        )}
      </main>
      <BottomBar />
    </div>
  )
}

function badge(r: ScanResult) {
  if (r.result === 'applied') return r.action === 'out' ? '✓ CHECKED OUT' : r.action === 'in' ? '✓ CHECKED IN' : '✓ DONE'
  switch (r.result) {
    case 'duplicate': return '• ALREADY DONE'
    case 'superseded': return '⟳ SUPERSEDED'
    default: return '✕ NOT ACCEPTED'
  }
}
function message(r: ScanResult, stationName?: string) {
  if (r.result === 'applied') {
    if (r.action === 'in') return `Checked in at ${stationName ?? r.station}.`
    if (r.action === 'out') return `Checked out of ${stationName ?? r.station}.`
    return r.station ? `Now at ${r.station}.` : 'Recorded.'
  }
  switch (r.result) {
    case 'duplicate': return 'Already recorded — nothing to do.'
    case 'superseded': return 'Another scan already handled this. Nothing to do.'
    default: return r.hint ?? r.reason ?? 'This scan was not accepted.'
  }
}
