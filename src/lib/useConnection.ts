import { useEffect, useState } from 'react'
import { DEMO, ping } from './api'

export type Conn = 'demo' | 'online' | 'offline'

// Reflects the real link to the data server: 'demo' when no server is
// configured (Vercel w/o VITE_API_BASE), else 'online'/'offline' by polling
// /health. This is what the footer status pill shows.
export function useConnection(): Conn {
  const [conn, setConn] = useState<Conn>(DEMO ? 'demo' : 'offline')
  useEffect(() => {
    if (DEMO) return
    let alive = true
    const check = () => ping().then((ok) => alive && setConn(ok ? 'online' : 'offline'))
    check()
    const id = setInterval(check, 15000)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => {
      alive = false
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return conn
}
