import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import AdminHome from './pages/AdminHome'
import AdminOverview from './pages/AdminOverview'
import type { SessionUser } from './components/UtilityBars'

// V1 visual prototype: no backend yet. PIN accepts any 6 digits and lands on
// the Admin home. Replace with real auth + routing in the app build phase.
const DEMO_USER: SessionUser = { name: 'AASHISH', role: 'ADMIN', id: '88-AFY5' }

type Screen = 'login' | 'home' | 'overview'

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')

  switch (screen) {
    case 'overview':
      return (
        <AdminOverview
          user={DEMO_USER}
          onBack={() => setScreen('home')}
          onLock={() => setScreen('login')}
        />
      )
    case 'home':
      return (
        <AdminHome
          user={DEMO_USER}
          onOpenOverview={() => setScreen('overview')}
          onLock={() => setScreen('login')}
        />
      )
    default:
      return <LoginPage user={DEMO_USER} onLogin={() => setScreen('home')} />
  }
}
