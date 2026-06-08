import { useRef, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import grynxWordmark from '../assets/grynx-wordmark.png'
import dlyftWordmark from '../assets/dlyft-wordmark.png'
import dlyftWordmarkLight from '../assets/dlyft-wordmark-light.png'
import './LoginPage.css'

const PIN_LENGTH = 6
const DEMO_PIN = '123456'

export default function LoginPage({
  user,
  onLogin,
}: {
  user: SessionUser
  onLogin: () => void
}) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [wrong, setWrong] = useState(false)
  const inputs = useRef<Array<HTMLInputElement | null>>([])

  const complete = digits.every((d) => d !== '')

  function submit() {
    if (digits.join('') === DEMO_PIN) {
      onLogin()
    } else {
      setWrong(true)
      setDigits(Array(PIN_LENGTH).fill(''))
      inputs.current[0]?.focus()
    }
  }

  function setDigit(i: number, val: string) {
    if (wrong) setWrong(false)
    const v = val.replace(/\D/g, '').slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[i] = v
      return next
    })
    if (v && i < PIN_LENGTH - 1) inputs.current[i + 1]?.focus()
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus()
    }
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

          <div className="login__divider" />

          <img className="login__logo logo--dark" src={dlyftWordmark} alt="D-LYFT" />
          <img className="login__logo logo--light" src={dlyftWordmarkLight} alt="D-LYFT" />

          <div className="login__accent" />

          <div className="login__welcome">
            <span className="mono-label">Welcome</span>
            <h1 className="login__name display">{user.name}</h1>
            <span className="login__hint">Enter your PIN to continue</span>
          </div>

          <div className={`pin ${wrong ? 'is-wrong' : ''}`} onPaste={onPaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el
                }}
                className={`pin__box ${d ? 'is-filled' : ''}`}
                inputMode="numeric"
                type="password"
                autoComplete="off"
                maxLength={1}
                value={d}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                aria-label={`PIN digit ${i + 1}`}
              />
            ))}
          </div>
          <span className={`pin__caption mono-label ${wrong ? 'is-wrong' : ''}`}>
            {wrong ? 'Incorrect PIN — try again' : `${PIN_LENGTH}-digit PIN`}
          </span>

          <button
            className="btn btn--primary login__enter"
            disabled={!complete}
            onClick={submit}
          >
            <span>Enter</span>
            <span className="btn__arrow">→</span>
          </button>

          <button className="login__forgot mono-label">Forgot PIN?</button>
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
