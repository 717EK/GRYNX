import { useEffect, useState } from 'react'
import { biometricSupported, isBiometricEnrolled, registerBiometric, getUser } from '../lib/api'
import './BiometricEnroll.css'

const DISMISS_KEY = 'grynx-bio-dismissed'

// One-time offer (after PIN sign-in) to enable Face ID / fingerprint on this
// device. Skipped when unsupported, already enrolled, or previously dismissed.
export default function BiometricEnroll() {
  const u = getUser()
  const username = u?.username ?? ''
  const dismissed = (() => {
    try {
      return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]').includes(username.toLowerCase())
    } catch {
      return false
    }
  })()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setShow(biometricSupported() && !!username && !isBiometricEnrolled(username) && !dismissed)
  }, [username, dismissed])

  if (!show) return null

  function dismiss() {
    try {
      const list = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
      if (!list.includes(username.toLowerCase())) localStorage.setItem(DISMISS_KEY, JSON.stringify([...list, username.toLowerCase()]))
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  async function enable() {
    setBusy(true)
    setErr(null)
    try {
      await registerBiometric(navigator.platform || 'this device')
      setShow(false)
    } catch {
      setErr('Couldn’t enable — try again, or skip for now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bioenroll__overlay" onMouseDown={dismiss}>
      <div className="bioenroll" onMouseDown={(e) => e.stopPropagation()}>
        <svg className="bioenroll__ico" viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M12 4.5c-2.5 0-4.7 1-6.2 2.6M18.2 7.1A8.3 8.3 0 0 0 16 5.4" />
          <path d="M5 11a7 7 0 0 1 14 0v1.5M5 13.5V12" />
          <path d="M8.5 12a3.5 3.5 0 0 1 7 0v2.5M8.5 14.5V12" />
          <path d="M12 12v4.5M9.2 17.5a6 6 0 0 0 .5 2M14.8 16.5q.2 1.6 1 3" />
        </svg>
        <h3 className="bioenroll__title display">Faster sign-in</h3>
        <p className="bioenroll__text">Use Face ID / fingerprint to sign in on this device — no PIN needed next time.</p>
        {err && <span className="bioenroll__err mono-label">{err}</span>}
        <button className="btn btn--solid btn--block" disabled={busy} onClick={enable}>
          {busy ? 'Setting up…' : 'Enable biometric sign-in'}
        </button>
        <button className="bioenroll__skip mono-label" onClick={dismiss}>Not now</button>
      </div>
    </div>
  )
}
