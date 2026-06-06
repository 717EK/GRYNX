import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import AdminHome from './pages/AdminHome'
import type { SessionUser } from './components/UtilityBars'

// V1 visual prototype: no backend yet. PIN accepts any 6 digits and lands on
// the Admin home. Replace with real auth + routing in the app build phase.
const DEMO_USER: SessionUser = { name: 'AASHISH', role: 'ADMIN', id: '88-AFY5' }

export default function App() {
  const [authed, setAuthed] = useState(false)

  return authed ? (
    <AdminHome user={DEMO_USER} onLock={() => setAuthed(false)} />
  ) : (
    <LoginPage user={DEMO_USER} onLogin={() => setAuthed(true)} />
  )
}
