import { useEffect, useState } from 'react'
import { TopBar, BottomBar } from '../components/UtilityBars'
import { publicDepartments, signup, ApiError, type DeptLite } from '../lib/api'
import grynxWordmark from '../assets/grynx-wordmark.png'
import './LoginPage.css'
import './SignupPage.css'

export default function SignupPage({ onBack }: { onBack: () => void }) {
  const [depts, setDepts] = useState<DeptLite[]>([])
  const [phone, setPhone] = useState('')
  const [fullName, setFullName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    publicDepartments()
      .then((d) => setDepts(d.departments))
      .catch(() => setErr('Could not load departments'))
  }, [])

  const phoneOk = /^\+?[0-9][0-9 \-]{6,18}$/.test(phone.trim())
  const valid = phoneOk && fullName.trim().length >= 2 && departmentId && /^[0-9]{6}$/.test(pin) && pin === pin2

  async function submit() {
    setErr(null)
    if (!valid) {
      setErr(pin !== pin2 ? 'PINs don’t match' : 'Fill all fields (6-digit PIN)')
      return
    }
    setBusy(true)
    try {
      await signup({ phone: phone.trim(), fullName: fullName.trim(), departmentId, pin })
      setDone(true)
    } catch (e) {
      setErr(
        e instanceof ApiError && e.message === 'phone_already_registered'
          ? 'That phone number is already registered'
          : 'Could not create account — check your details',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <TopBar theme />
      <main className="app__body login">
        <div className="login__inner signup__inner">
          <img className="login__grynx" src={grynxWordmark} alt="GRYNX" />
          <span className="login__tagline mono-label">Create your account</span>
          <div className="login__divider" />

          {done ? (
            <div className="signup__done">
              <span className="signup__badge mono-label">✓ REQUEST SENT</span>
              <h1 className="login__name display">Pending approval</h1>
              <p className="signup__hint">
                Your account is awaiting admin approval. You’ll be able to sign in with your phone number and PIN once
                it’s approved.
              </p>
              <button className="btn btn--primary login__enter" onClick={onBack}>
                <span>Back to sign in</span>
                <span className="btn__arrow">→</span>
              </button>
            </div>
          ) : (
            <>
              <div className="signup__form">
                <label className="signup__field">
                  <span className="mono-label">Phone number (your ID)</span>
                  <input
                    className="login__user"
                    placeholder="+91 98765 43210"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label className="signup__field">
                  <span className="mono-label">Full name</span>
                  <input className="login__user" placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </label>
                <label className="signup__field">
                  <span className="mono-label">Department</span>
                  <select className="signup__select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">Select department…</option>
                    {depts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="signup__row">
                  <label className="signup__field">
                    <span className="mono-label">Create 6-digit PIN</span>
                    <input
                      className="login__user"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </label>
                  <label className="signup__field">
                    <span className="mono-label">Confirm PIN</span>
                    <input
                      className="login__user"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="••••••"
                      value={pin2}
                      onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </label>
                </div>
              </div>

              {err && <span className="pin__caption mono-label is-wrong">{err}</span>}

              <button className="btn btn--primary login__enter" disabled={!valid || busy} onClick={submit}>
                <span>{busy ? 'Submitting…' : 'Create account'}</span>
                <span className="btn__arrow">→</span>
              </button>
              <button className="login__forgot mono-label" onClick={onBack}>
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
