import { useEffect, useRef, useState } from 'react'

/** Live wall-clock as HH:MM:SS (24h). Honest readout for the SYNC field. */
export function useClock(): string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now.toTimeString().slice(0, 8)
}

/** Session uptime since first mount, formatted "0D 00H 00M". */
export function useUptime(): string {
  const start = useRef(Date.now())
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const s = Math.floor((Date.now() - start.current) / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d}D ${pad(h)}H ${pad(m)}M`
}
