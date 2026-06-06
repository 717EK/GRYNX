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

const KEY = 'grynx-theme'

export function applyTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0]
  const root = document.documentElement
  root.style.setProperty('--brand', t.brand)
  root.style.setProperty('--on-brand', t.on)
}

export function useTheme() {
  const [id, setId] = useState(() => localStorage.getItem(KEY) || 'amber')
  useEffect(() => {
    applyTheme(id)
    localStorage.setItem(KEY, id)
  }, [id])
  return { id, setId }
}
