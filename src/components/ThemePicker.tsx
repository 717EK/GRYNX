import { useEffect, useRef, useState } from 'react'
import { THEMES, useTheme } from '../lib/useTheme'
import './ThemePicker.css'

export default function ThemePicker() {
  const { id, setId, mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div className="theme" ref={ref}>
      <button
        className="theme__btn"
        title="Accent colour"
        aria-label="Accent colour"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="theme__chip" style={{ background: 'var(--brand)' }} />
      </button>
      {open && (
        <div className="theme__menu">
          <span className="theme__label mono-label">Mode</span>
          <div className="theme__modes">
            <button
              className={`theme__mode ${mode === 'dark' ? 'is-active' : ''}`}
              onClick={() => setMode('dark')}
            >
              ☾ Night
            </button>
            <button
              className={`theme__mode ${mode === 'light' ? 'is-active' : ''}`}
              onClick={() => setMode('light')}
            >
              ☀ Day
            </button>
          </div>
          <span className="theme__label mono-label">Accent</span>
          <div className="theme__grid">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme__swatch ${t.id === id ? 'is-active' : ''}`}
                title={t.name}
                onClick={() => {
                  setId(t.id)
                  setOpen(false)
                }}
              >
                <span className="theme__dot" style={{ background: t.brand }} />
                <span className="theme__name mono-label">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
