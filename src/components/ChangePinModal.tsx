import { useState } from 'react'
import { changePin, ApiError } from '../lib/api'
import './ChangePinModal.css'

// Self-service "change my PIN" — verify the current PIN, set a new one. Lets every
// user (and the admin) move off the default PIN without going through an admin reset.
export default function ChangePinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [conf, setConf] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!open) return null
  const six = (s: string) => /^[0-9]{6}$/.test(s)
  const valid = six(cur) && six(next) && next === conf && next !== cur
  const clean = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  async function submit() {
    setErr(null)
    if (!six(next)) return setErr('New PIN must be 6 digits')
    if (next !== conf) return setErr('New PINs don’t match')
    if (next === cur) return setErr('New PIN must be different from the current one')
    setBusy(true)
    try {
      await changePin(cur, next)
      setDone(true)
    } catch (e) {
      setErr(e instanceof ApiError && e.message === 'wrong_pin' ? 'Current PIN is incorrect' : 'Could not change PIN — try again')
      setBusy(false)
    }
  }

  return (
    <div className="cpin__overlay" onMouseDown={onClose}>
      <div className="cpin__modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cpin__head">
          <span className="display cpin__title">{done ? 'PIN updated' : 'Change your PIN'}</span>
          <button className="cpin__x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {done ? (
          <>
            <p className="cpin__hint">✓ Your PIN has been changed. Use the new PIN next time you sign in.</p>
            <button className="btn btn--solid cpin__go" onClick={onClose}>Done</button>
          </>
        ) : (
          <>
            <p className="cpin__hint">Pick a PIN only you know — don’t keep the default.</p>
            <label className="cpin__field"><span className="mono-label">Current PIN</span>
              <input className="cpin__in" type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={cur} onChange={(e) => setCur(clean(e.target.value))} /></label>
            <label className="cpin__field"><span className="mono-label">New PIN</span>
              <input className="cpin__in" type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={next} onChange={(e) => setNext(clean(e.target.value))} /></label>
            <label className="cpin__field"><span className="mono-label">Confirm new PIN</span>
              <input className="cpin__in" type="password" inputMode="numeric" maxLength={6} placeholder="••••••" value={conf} onChange={(e) => setConf(clean(e.target.value))} /></label>
            {err && <span className="cpin__err mono-label">{err}</span>}
            <button className="btn btn--solid cpin__go" disabled={!valid || busy} onClick={submit}>{busy ? 'Saving…' : 'Update PIN'}</button>
          </>
        )}
      </div>
    </div>
  )
}
