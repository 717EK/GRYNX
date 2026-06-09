import { useRef, useState } from 'react'
import { TopBar, BottomBar } from '../components/UtilityBars'
import { login as apiLogin, ApiError, DEMO, type ApiUser } from '../lib/api'
import grynxWordmark from '../assets/grynx-wordmark.png'
import dlyftWordmark from '../assets/dlyft-wordmark.png'
import dlyftWordmarkLight from '../assets/dlyft-wordmark-light.png'
import './LoginPage.css'

const PIN_LENGTH = 6
const LAST_USER_KEY = 'grynx-last-username'

export default function LoginPage({ onLogin, onSignup }: { onLogin: (user: ApiUser) => void; onSignup: () => void }) {
  const remembered = localStorage.getItem(LAST_USER_KEY) ?? ''
  // returning users go straight to PIN entry; first-timers get the ID field
  const [editingUser, setEditingUser] = useState(remembered === '')
  const [username, setUsername] = useState(remembered.toUpperCase())
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [reveal, setReveal] = useState(-1) // index shown as a digit; others masked
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const revealTimer = useRef<ReturnType<typeof setTimeout>>()

  const loginId = (editingUser ? username : remembered).trim()
  const complete = loginId !== '' && digits.every((d) => d !== '')

  async function submit() {
    if (!complete || busy) return
    setBusy(true)
    setError(null)
    try {
      const u = await apiLogin(loginId.toUpperCase(), digits.join(''))
      localStorage.setItem(LAST_USER_KEY, u.username) // remember for next time
      onLogin(u)
    } catch (e) {
      let msg = 'Incorrect login ID or PIN'
      if (e instanceof ApiError) {
        if (e.status === 429) msg = 'Too many attempts — wait a minute'
        else if (e.message === 'account_pending') msg = 'Account awaiting admin approval'
        else if (e.message === 'account_suspended') msg = 'Account suspended — contact admin'
      } else {
        // fetch threw (server down / wrong API URL / no network) — not a bad PIN
        msg = 'Can’t reach the server — check your connection'
      }
      setError(msg)
      setDigits(Array(PIN_LENGTH).fill(''))
      inputs.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  function switchUser() {
    localStorage.removeItem(LAST_USER_KEY)
    setUsername('')
    setEditingUser(true)
    setError(null)
    setDigits(Array(PIN_LENGTH).fill(''))
  }

  function setDigit(i: number, val: string) {
    if (error) setError(null)
    const v = val.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = v
      return next
    })
    if (v) {
      // reveal this digit; it masks when the next is entered or after a moment
      setReveal(i)
      clearTimeout(revealTimer.current)
      revealTimer.current = setTimeout(() => setReveal(-1), 500)
      if (i < PIN_LENGTH - 1) inputs.current[i + 1]?.focus()
    }
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus()
    if (e.key === 'Enter' && complete) submit()
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    if (!text) return
    e.preventDefault()
    const next = Array(PIN_LENGTH).fill('')
    text.split('').forEach((c, idx) => (next[idx] = c))
    setDigits(next)
    inputs.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus()
  }

  return (
    <div className="app">
      <TopBar theme />
      <main className="app__body login">
        <div className="login__inner">
          <img className="login__grynx" src={grynxWordmark} alt="GRYNX" />
          <span className="login__tagline mono-label">Track. Sync. Execute.</span>
          {DEMO && <span className="login__demo mono-label">DEMO MODE · no server · data saved on this device</span>}

          <div className="login__divider" />

          <img className="login__logo logo--dark" src={dlyftWordmark} alt="D-LYFT" />
          <img className="login__logo logo--light" src={dlyftWordmarkLight} alt="D-LYFT" />

          <div className="login__accent" />

          <div className="login__welcome">
            <span className="mono-label">{editingUser ? 'Welcome' : 'Welcome back'}</span>
            <h1 className="login__name display">{editingUser ? 'Sign in' : remembered.toUpperCase()}</h1>
            <span className="login__hint">{editingUser ? 'Enter your login ID & PIN' : 'Enter your PIN to continue'}</span>
          </div>

          {editingUser && (
            <input
              className="login__user"
              placeholder="LOGIN ID"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => {
                if (error) setError(null)
                setUsername(e.target.value.toUpperCase())
              }}
              aria-label="Login ID"
            />
          )}

          <div className={`pin ${error ? 'is-wrong' : ''}`} onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el
                }}
                className={`pin__box ${d ? 'is-filled' : ''}`}
                inputMode="numeric"
                type={reveal === i ? 'text' : 'password'}
                autoComplete="off"
                maxLength={1}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                aria-label={`PIN digit ${i + 1}`}
              />
            ))}
          </div>
          <span className={`pin__caption mono-label ${error ? 'is-wrong' : ''}`}>
            {error ?? `${PIN_LENGTH}-digit PIN`}
          </span>

          <button className="btn btn--primary login__enter" disabled={!complete || busy} onClick={submit}>
            <span>{busy ? 'Signing in…' : 'Enter'}</span>
            <span className="btn__arrow">→</span>
          </button>

          {!editingUser ? (
            <button className="login__signup mono-label" onClick={switchUser}>
              Not {remembered.toUpperCase()}? <b>Switch account</b>
            </button>
          ) : (
            <button className="login__signup mono-label" onClick={onSignup}>
              New here? <b>Create an account</b>
            </button>
          )}
          <button className="login__forgot mono-label">Forgot PIN?</button>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
