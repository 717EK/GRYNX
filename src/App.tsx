import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import AdminHome from './pages/AdminHome'
import AdminOverview from './pages/AdminOverview'
import CreateJob from './pages/CreateJob'
import PpcReview from './pages/PpcReview'
import type { SessionUser } from './components/UtilityBars'

// V1 visual prototype: no backend yet. PIN accepts any 6 digits and lands on
// the Admin home. Replace with real auth + routing in the app build phase.
const DEMO_USER: SessionUser = { name: 'AASHISH', role: 'ADMIN', id: '88-AFY5' }

export type Screen = 'login' | 'home' | 'overview' | 'create' | 'ppc'

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const go = (s: Screen) => setScreen(s)

  switch (screen) {
    case 'overview':
      return <AdminOverview user={DEMO_USER} onBack={() => go('home')} onLock={() => go('login')} />
    case 'create':
      return (
        <CreateJob
          user={DEMO_USER}
          onBack={() => go('home')}
          onLock={() => go('login')}
          onOpenPpc={() => go('ppc')}
        />
      )
    case 'ppc':
      return (
        <PpcReview
          user={DEMO_USER}
          onBack={() => go('create')}
          onLock={() => go('login')}
          onApprove={() => go('overview')}
        />
      )
    case 'home':
      return (
        <AdminHome
          user={DEMO_USER}
          onNavigate={go}
          onOpenOverview={() => go('overview')}
          onLock={() => go('login')}
        />
      )
    default:
      return <LoginPage user={DEMO_USER} onLogin={() => go('home')} />
  }
}
