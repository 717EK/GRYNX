import { useCallback, useEffect, useRef, useState } from 'react'
import { submitFeedback, type FeedbackKind, type FeedbackSeverity } from '../lib/api'
import { getLog } from '../lib/reportLog'
import { APP_VERSION } from './UtilityBars'
import './FeedbackFab.css'

const POS_KEY = 'grynx-fbk-pos'
const SIZE = 50 // button diameter, keep in sync with CSS
const KINDS: { v: FeedbackKind; label: string; icon: string }[] = [
  { v: 'bug', label: 'Bug', icon: '🐞' },
  { v: 'idea', label: 'Idea', icon: '💡' },
  { v: 'feedback', label: 'Note', icon: '💬' },
]
const SEVS: FeedbackSeverity[] = ['low', 'normal', 'high', 'critical']

type Pos = { x: number; y: number }
function clampToView(p: Pos): Pos {
  const w = typeof window !== 'undefined' ? window.innerWidth : 400
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return { x: Math.min(Math.max(8, p.x), w - SIZE - 8), y: Math.min(Math.max(8, p.y), h - SIZE - 8) }
}
function loadPos(): Pos {
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || ''); if (typeof p?.x === 'number') return clampToView(p) } catch { /* default */ }
  const w = typeof window !== 'undefined' ? window.innerWidth : 400
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  return { x: w - SIZE - 16, y: h - SIZE - 110 }
}

export default function FeedbackFab({ screen, username, role }: { screen: string; username?: string; role?: string }) {
  const [pos, setPos] = useState<Pos>(loadPos)
  const [open, setOpen] = useState(false)
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null)

  // keep the button on-screen across rotations / resizes
  useEffect(() => {
    const onResize = () => setPos((p) => clampToView(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const nx = e.clientX - drag.current.dx
    const ny = e.clientY - drag.current.dy
    if (Math.abs(e.clientX - (drag.current.dx + pos.x)) > 5 || Math.abs(e.clientY - (drag.current.dy + pos.y)) > 5) drag.current.moved = true
    setPos(clampToView({ x: nx, y: ny }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const wasDrag = drag.current?.moved
    if (drag.current) { try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ } }
    drag.current = null
    if (wasDrag) { localStorage.setItem(POS_KEY, JSON.stringify(pos)) }
    else setOpen(true) // a tap (not a drag) opens the form
  }

  return (
    <>
      <button
        className="fbk-fab fbk-ignore"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        aria-label="Report feedback or a bug"
        title="Feedback / report a bug"
      >
        <span aria-hidden>✦</span>
      </button>
      {open && (
        <ReportForm
          screen={screen}
          username={username}
          role={role}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ReportForm({ screen, username, role, onClose }: { screen: string; username?: string; role?: string; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [severity, setSeverity] = useState<FeedbackSeverity>('normal')
  const [remark, setRemark] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const capture = useCallback(async () => {
    setCapturing(true); setErr(null)
    try {
      const { default: html2canvas } = await import('html2canvas')
      const canvas = await html2canvas(document.body, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#111',
        scale: Math.min(0.6, window.devicePixelRatio || 1),
        logging: false,
        useCORS: true,
        ignoreElements: (el) => el.classList?.contains('fbk-ignore') || el.classList?.contains('fbk-overlay'),
      })
      setShot(canvas.toDataURL('image/jpeg', 0.7))
    } catch {
      setErr('Could not capture the screen — you can still send the report.')
    } finally {
      setCapturing(false)
    }
  }, [])

  async function save() {
    if (!remark.trim()) { setErr('Add a short remark first.'); return }
    setBusy(true); setErr(null)
    const context = {
      screen,
      role: role ?? null,
      username: username ?? null,
      version: APP_VERSION,
      url: typeof location !== 'undefined' ? location.href : '',
      userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
      capturedAt: new Date().toISOString(),
      log: getLog(),
    }
    try {
      await submitFeedback({ kind, severity, screen, remark: remark.trim(), context, screenshot: shot ?? undefined })
      setDone(true)
      setTimeout(onClose, 850) // pop back to the button
    } catch {
      setErr('Could not send — check connection and retry.')
      setBusy(false)
    }
  }

  return (
    <div className="fbk-overlay" onMouseDown={onClose}>
      <div className="fbk-sheet fbk-ignore" onMouseDown={(e) => e.stopPropagation()}>
        {done ? (
          <div className="fbk-done">
            <span className="fbk-done-tick">✓</span>
            <span className="display">Report sent</span>
            <span className="mono-label">Thanks — logged for the team.</span>
          </div>
        ) : (
          <>
            <div className="fbk-head">
              <span className="display fbk-title">Report</span>
              <span className="mono-label fbk-screen">on {screen}</span>
              <button className="fbk-x" onClick={onClose} aria-label="Close">×</button>
            </div>

            <div className="fbk-kinds">
              {KINDS.map((k) => (
                <button key={k.v} className={`fbk-kind ${kind === k.v ? 'is-on' : ''}`} onClick={() => setKind(k.v)}>
                  <span aria-hidden>{k.icon}</span> {k.label}
                </button>
              ))}
            </div>

            <textarea
              className="fbk-remark"
              placeholder={kind === 'bug' ? 'What went wrong? e.g. “notifications aren’t updating live on the dept home”' : 'What would you like to see / change?'}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              rows={4}
              autoFocus
            />

            <div className="fbk-row">
              <label className="mono-label fbk-sevlabel">Severity</label>
              <div className="fbk-sevs">
                {SEVS.map((s) => (
                  <button key={s} className={`fbk-sev fbk-sev--${s} ${severity === s ? 'is-on' : ''}`} onClick={() => setSeverity(s)}>{s}</button>
                ))}
              </div>
            </div>

            {shot ? (
              <div className="fbk-shotwrap">
                <img className="fbk-shot" src={shot} alt="screen capture" />
                <button className="fbk-shotrm" onClick={() => setShot(null)} aria-label="Remove screenshot">Remove screenshot</button>
              </div>
            ) : (
              <button className="fbk-attach" onClick={capture} disabled={capturing}>
                {capturing ? 'Capturing…' : '📷 Attach screenshot (optional)'}
              </button>
            )}

            {err && <span className="fbk-err mono-label">{err}</span>}

            <button className="fbk-save" onClick={save} disabled={busy}>
              {busy ? 'Sending…' : 'Save report'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
