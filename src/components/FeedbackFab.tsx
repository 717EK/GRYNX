import { useCallback, useEffect, useRef, useState } from 'react'
import { submitFeedback, type FeedbackKind, type FeedbackSeverity } from '../lib/api'
import { getLog } from '../lib/reportLog'
import { APP_VERSION } from './UtilityBars'
import './FeedbackFab.css'

const POS_KEY = 'grynx-fbk-pos'
const SIZE = 50
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
  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number; moved: boolean } | null>(null)

  useEffect(() => {
    const onResize = () => setPos((p) => clampToView(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    if (Math.abs(e.clientX - drag.current.sx) > 5 || Math.abs(e.clientY - drag.current.sy) > 5) drag.current.moved = true
    setPos(clampToView({ x: e.clientX - drag.current.ox, y: e.clientY - drag.current.oy }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const wasDrag = drag.current?.moved
    if (drag.current) { try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ } }
    drag.current = null
    if (wasDrag) localStorage.setItem(POS_KEY, JSON.stringify(pos))
    else setOpen(true)
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
      {open && <ReportForm screen={screen} username={username} role={role} onClose={() => setOpen(false)} />}
    </>
  )
}

type SpeechRec = { start: () => void; stop: () => void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null }

function ReportForm({ screen, username, role, onClose }: { screen: string; username?: string; role?: string; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>('bug')
  const [severity, setSeverity] = useState<FeedbackSeverity>('normal')
  const [remark, setRemark] = useState('')
  const [shot, setShot] = useState<string | null>(null)       // screen capture
  const [image, setImage] = useState<string | null>(null)     // attached image
  const [audio, setAudio] = useState<string | null>(null)     // voice note
  const [capturing, setCapturing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const speech = useRef<SpeechRec | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { stopRecording(); if (timer.current) clearInterval(timer.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── screen capture (modern-screenshot handles color-mix etc. that crash html2canvas)
  const capture = useCallback(async () => {
    setCapturing(true); setErr(null)
    try {
      const { domToJpeg } = await import('modern-screenshot')
      const dataUrl = await domToJpeg(document.body, {
        quality: 0.7,
        scale: 0.5,
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#111',
        filter: (node) => {
          const el = node as HTMLElement
          return !(el?.classList?.contains?.('fbk-ignore') || el?.classList?.contains?.('fbk-overlay'))
        },
      })
      setShot(dataUrl)
    } catch {
      setErr('Could not capture the screen — try “Add image” instead.')
    } finally {
      setCapturing(false)
    }
  }, [])

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImage(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
  }

  async function startRecording() {
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunks.current = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (ev) => { if (ev.data.size) chunks.current.push(ev.data) }
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' })
        const reader = new FileReader()
        reader.onload = () => setAudio(typeof reader.result === 'string' ? reader.result : null)
        reader.readAsDataURL(blob)
      }
      mr.start()
      recorder.current = mr
      // live transcription where supported → drops straight into the remark
      const SR = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
      const Ctor = SR.SpeechRecognition || SR.webkitSpeechRecognition
      if (Ctor) {
        const rec = new Ctor()
        rec.lang = 'en-IN'; rec.continuous = true; rec.interimResults = false
        rec.onresult = (e) => {
          let add = ''
          for (let i = 0; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript + ' '
          if (add) setRemark((r) => (r ? r + ' ' : '') + add.trim())
        }
        rec.onerror = () => {}; rec.onend = () => {}
        try { rec.start(); speech.current = rec } catch { /* ignore */ }
      }
      setRecording(true); setSecs(0)
      timer.current = setInterval(() => setSecs((s) => { if (s >= 59) { stopRecording() ; return 60 } return s + 1 }), 1000)
    } catch {
      setErr('Microphone not available or permission denied.')
    }
  }
  function stopRecording() {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
    try { recorder.current?.state !== 'inactive' && recorder.current?.stop() } catch { /* ignore */ }
    try { speech.current?.stop() } catch { /* ignore */ }
    recorder.current = null; speech.current = null
    setRecording(false)
  }

  async function save() {
    if (!remark.trim() && !audio) { setErr('Add a short remark (or a voice note) first.'); return }
    setBusy(true); setErr(null)
    const context = {
      screen, role: role ?? null, username: username ?? null, version: APP_VERSION,
      url: typeof location !== 'undefined' ? location.href : '', userAgent: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`, online: navigator.onLine,
      capturedAt: new Date().toISOString(), log: getLog(),
    }
    try {
      await submitFeedback({ kind, severity, screen, remark: remark.trim() || '(voice note)', context, screenshot: shot ?? undefined, image: image ?? undefined, audio: audio ?? undefined })
      setDone(true)
      setTimeout(onClose, 850)
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

            <div className="fbk-scroll">
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
                rows={3}
              />

              <div className="fbk-row">
                <label className="mono-label fbk-sevlabel">Severity</label>
                <div className="fbk-sevs">
                  {SEVS.map((s) => (
                    <button key={s} className={`fbk-sev fbk-sev--${s} ${severity === s ? 'is-on' : ''}`} onClick={() => setSeverity(s)}>{s}</button>
                  ))}
                </div>
              </div>

              {/* attachments */}
              <div className="fbk-attachrow">
                {shot ? (
                  <span className="fbk-chip">📸 Screenshot <button onClick={() => setShot(null)} aria-label="remove">×</button></span>
                ) : (
                  <button className="fbk-attbtn" onClick={capture} disabled={capturing}>{capturing ? 'Capturing…' : '📸 Screenshot'}</button>
                )}
                {image ? (
                  <span className="fbk-chip">🖼 Image <button onClick={() => setImage(null)} aria-label="remove">×</button></span>
                ) : (
                  <label className="fbk-attbtn">🖼 Add image
                    <input type="file" accept="image/*" hidden onChange={onPickImage} />
                  </label>
                )}
                {audio ? (
                  <span className="fbk-chip">🎤 Voice <button onClick={() => setAudio(null)} aria-label="remove">×</button></span>
                ) : recording ? (
                  <button className="fbk-attbtn fbk-recording" onClick={stopRecording}>● Stop {secs}s</button>
                ) : (
                  <button className="fbk-attbtn" onClick={startRecording}>🎤 Voice note</button>
                )}
              </div>

              {(shot || image) && (
                <div className="fbk-previews">
                  {shot && <img className="fbk-shot" src={shot} alt="screen capture" />}
                  {image && <img className="fbk-shot" src={image} alt="attached" />}
                </div>
              )}

              {err && <span className="fbk-err mono-label">{err}</span>}
            </div>

            <button className="fbk-save" onClick={save} disabled={busy}>{busy ? 'Sending…' : 'Save report'}</button>
          </>
        )}
      </div>
    </div>
  )
}
