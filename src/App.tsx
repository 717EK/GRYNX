import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import AdminHome from './pages/AdminHome'
import AdminOverview from './pages/AdminOverview'
import CreateJob from './pages/CreateJob'
import PpcReview from './pages/PpcReview'
import Departments from './pages/Departments'
import Maintenance from './pages/Maintenance'
import JobStatus from './pages/JobStatus'
import JobDetail from './pages/JobDetail'
import Notifications from './pages/Notifications'
import DepartmentDetail from './pages/DepartmentDetail'
import MaintenanceDetail from './pages/MaintenanceDetail'
import UpdatePrompt from './components/UpdatePrompt'
import { registerNav } from './lib/nav'
import type { SessionUser } from './components/UtilityBars'

// V1 visual prototype: no backend yet. PIN accepts any 6 digits and lands on
// the Admin home. Replace with real auth + routing in the app build phase.
const DEMO_USER: SessionUser = { name: 'AASHISH', role: 'ADMIN', id: '88-AFY5' }

export type Screen =
  | 'login'
  | 'home'
  | 'overview'
  | 'create'
  | 'ppc'
  | 'departments'
  | 'maintenance'
  | 'jobstatus'
  | 'jobdetail'
  | 'notifications'
  | 'departmentdetail'
  | 'maintenancedetail'

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const go = (s: Screen) => setScreen(s)

  // expose navigation to chrome (top-bar bell, etc.)
  useEffect(() => registerNav(go), [])

  const renderScreen = () => {
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
      case 'departments':
        return (
          <Departments
            user={DEMO_USER}
            onBack={() => go('home')}
            onLock={() => go('login')}
            onOpenDept={() => go('departmentdetail')}
          />
        )
      case 'departmentdetail':
        return (
          <DepartmentDetail
            user={DEMO_USER}
            onBack={() => go('departments')}
            onLock={() => go('login')}
            onOpenJob={() => go('jobdetail')}
          />
        )
      case 'maintenance':
        return (
          <Maintenance
            user={DEMO_USER}
            onBack={() => go('home')}
            onLock={() => go('login')}
            onOpenTicket={() => go('maintenancedetail')}
          />
        )
      case 'maintenancedetail':
        return <MaintenanceDetail user={DEMO_USER} onBack={() => go('maintenance')} onLock={() => go('login')} />
      case 'jobstatus':
        return (
          <JobStatus
            user={DEMO_USER}
            onBack={() => go('home')}
            onLock={() => go('login')}
            onOpenJob={() => go('jobdetail')}
          />
        )
      case 'jobdetail':
        return <JobDetail user={DEMO_USER} onBack={() => go('jobstatus')} onLock={() => go('login')} />
      case 'notifications':
        return <Notifications user={DEMO_USER} onBack={() => go('home')} onLock={() => go('login')} />
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

  return (
    <>
      {renderScreen()}
      <UpdatePrompt />
    </>
  )
}
