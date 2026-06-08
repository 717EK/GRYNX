import { useEffect, useState } from 'react'

export interface Theme {
  id: string
  name: string
  brand: string
  on: string // text color on a solid brand fill
}

// Accent themes. --brand drives every interactive element; hovers follow it via
// color-mix(). DELAY/ALERT stay amber and status green/red regardless of theme.
export const THEMES: Theme[] = [
  { id: 'amber', name: 'Amber', brand: '#f5a623', on: '#0a0a0a' },
  { id: 'azure', name: 'Azure', brand: '#3b82f6', on: '#ffffff' },
  { id: 'cyan', name: 'Cyan', brand: '#22d3ee', on: '#04181c' },
  { id: 'lime', name: 'Lime', brand: '#84cc16', on: '#0a1404' },
  { id: 'violet', name: 'Violet', brand: '#8b7cf6', on: '#0b0820' },
  { id: 'rose', name: 'Rose', brand: '#fb7185', on: '#1a0508' },
]

export type Mode = 'dark' | 'light'

const KEY = 'grynx-theme'
const MODE_KEY = 'grynx-mode'

export function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0]
  const root = document.documentElement
  root.style.setProperty('--brand', t.brand)
  root.style.setProperty('--on-brand', t.on)
}

export function applyMode(mode: Mode) {
  document.documentElement.dataset.mode = mode
}

export function useTheme() {
  const [id, setId] = useState(() => localStorage.getItem(KEY) || 'amber')
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE_KEY) as Mode) || 'dark')

  useEffect(() => {
    applyTheme(id)
    localStorage.setItem(KEY, id)
  }, [id])

  useEffect(() => {
    applyMode(mode)
    localStorage.setItem(MODE_KEY, mode)
  }, [mode])

  return { id, setId, mode, setMode }
}
