import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import AdminHome from './pages/AdminHome'
import AdminOverview from './pages/AdminOverview'
import CreateJob from './pages/CreateJob'
import Departments from './pages/Departments'
import Maintenance from './pages/Maintenance'
import JobStatus from './pages/JobStatus'
import JobDetail from './pages/JobDetail'
import Notifications from './pages/Notifications'
import DepartmentDetail from './pages/DepartmentDetail'
import MaintenanceDetail from './pages/MaintenanceDetail'
import Insights from './pages/Insights'
import QcInspection from './pages/QcInspection'
import FgClosure from './pages/FgClosure'
import ScanPage from './pages/ScanPage'
import SignupPage from './pages/SignupPage'
import Approvals from './pages/Approvals'
import UpdatePrompt from './components/UpdatePrompt'
import { registerNav } from './lib/nav'
import type { SessionUser } from './components/UtilityBars'
import { getUser, isAuthed, logout, getDepartments, type ApiUser } from './lib/api'

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
  | 'insights'
  | 'ppcrequest'
  | 'qc'
  | 'fgclosure'
  | 'scan'
  | 'signup'
  | 'approvals'

const FLOOR_ROLES = ['dept_head', 'qc', 'fg_stock', 'maintenance']

function landingFor(u: ApiUser): Screen {
  if (u.roles.some((r) => r.role === 'admin')) return 'home'
  if (u.roles.some((r) => r.role === 'ppc')) return 'create'
  return 'scan'
}

function toSession(u: ApiUser, depNames: Record<string, string>): SessionUser {
  const roleNames: Record<string, string> = { admin: 'ADMIN', ppc: 'PPC', qc: 'QC', fg_stock: 'FG STOCK', maintenance: 'MAINT' }
  let role = 'OPERATOR'
  if (u.roles.some((r) => r.role === 'admin')) role = 'ADMIN'
  else if (u.roles.some((r) => r.role === 'ppc')) role = 'PPC'
  else {
    const floor = u.roles.find((r) => FLOOR_ROLES.includes(r.role))
    if (floor) role = (floor.departmentId && depNames[floor.departmentId]) || roleNames[floor.role] || 'OPERATOR'
  }
  return { name: u.fullName, role, id: u.username.toUpperCase() }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => (isAuthed() ? 'home' : 'login'))
  const [user, setUser] = useState<SessionUser | null>(null)
  const [depNames, setDepNames] = useState<Record<string, string>>({})
  const [maintTicketId, setMaintTicketId] = useState<string | null>(null)
  const go = (s: Screen) => setScreen(s)

  useEffect(() => registerNav(go), [])

  // load department names (for station labels) + restore session on refresh
  useEffect(() => {
    if (!isAuthed()) return
    getDepartments()
      .then((d) => {
        const map = Object.fromEntries(d.departments.map((x) => [x.id, x.name]))
        setDepNames(map)
        const u = getUser()
        if (u) {
          setUser(toSession(u, map))
          setScreen(landingFor(u))
        }
      })
      .catch(() => handleLock())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleLogin(u: ApiUser) {
    setUser(toSession(u, depNames))
    setScreen(landingFor(u))
    // refresh station names if not loaded yet
    if (Object.keys(depNames).length === 0) {
      getDepartments()
        .then((d) => {
          const map = Object.fromEntries(d.departments.map((x) => [x.id, x.name]))
          setDepNames(map)
          setUser(toSession(u, map))
        })
        .catch(() => {})
    }
  }

  function handleLock() {
    logout()
    setUser(null)
    setScreen('login')
  }

  if (!user) {
    return (
      <>
        {screen === 'signup' ? (
          <SignupPage onBack={() => go('login')} />
        ) : (
          <LoginPage onLogin={handleLogin} onSignup={() => go('signup')} />
        )}
        <UpdatePrompt />
      </>
    )
  }

  const renderScreen = () => {
    switch (screen) {
      case 'scan':
        return <ScanPage user={user} onLock={handleLock} />
      case 'approvals':
        return <Approvals user={user} onBack={() => go('home')} onLock={handleLock} />
      case 'overview':
        return <AdminOverview user={user} onBack={() => go('home')} onLock={handleLock} onOpenInsights={() => go('insights')} />
      case 'insights':
        return <Insights user={user} onBack={() => go('overview')} onLock={handleLock} onOpenJob={() => go('jobdetail')} />
      case 'ppcrequest':
        return <CreateJob variant="ppc" user={user} onBack={() => go('jobstatus')} onLock={handleLock} />
      case 'qc':
        return <QcInspection user={user} onBack={() => go('jobstatus')} onLock={handleLock} onOpenJob={() => go('jobdetail')} />
      case 'fgclosure':
        return <FgClosure user={user} onBack={() => go('jobstatus')} onLock={handleLock} onOpenJob={() => go('jobdetail')} />
      case 'create':
        return <CreateJob user={user} onBack={() => go('home')} onLock={handleLock} onOpenPpc={() => go('ppc')} />
      case 'ppc':
        return <CreateJob variant="review" user={user} onBack={() => go('create')} onLock={handleLock} onReject={() => go('create')} />
      case 'departments':
        return <Departments user={user} onBack={() => go('home')} onLock={handleLock} onOpenDept={() => go('departmentdetail')} />
      case 'departmentdetail':
        return <DepartmentDetail user={user} onBack={() => go('departments')} onLock={handleLock} onOpenJob={() => go('jobdetail')} />
      case 'maintenance':
        return (
          <Maintenance
            user={user}
            onBack={() => go('home')}
            onLock={handleLock}
            onOpenTicket={(id) => {
              setMaintTicketId(id)
              go('maintenancedetail')
            }}
          />
        )
      case 'maintenancedetail':
        return <MaintenanceDetail user={user} ticketId={maintTicketId} onBack={() => go('maintenance')} onLock={handleLock} />
      case 'jobstatus':
        return <JobStatus user={user} onBack={() => go('home')} onLock={handleLock} onOpenJob={() => go('jobdetail')} />
      case 'jobdetail':
        return <JobDetail user={user} onBack={() => go('jobstatus')} onLock={handleLock} />
      case 'notifications':
        return <Notifications user={user} onBack={() => go('home')} onLock={handleLock} />
      case 'home':
      default:
        return <AdminHome user={user} onNavigate={go} onOpenOverview={() => go('overview')} onLock={handleLock} />
    }
  }

  return (
    <>
      {renderScreen()}
      <UpdatePrompt />
    </>
  )
}
