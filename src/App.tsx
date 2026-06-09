import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage'
import AdminHome from './pages/AdminHome'
import AdminOverview from './pages/AdminOverview'
import CreateJob from './pages/CreateJob'
import JobHub from './pages/JobHub'
import PpcReviewSheet from './pages/PpcReviewSheet'
import PpcInbox from './pages/PpcInbox'
import Departments from './pages/Departments'
import Maintenance from './pages/Maintenance'
import JobStatus from './pages/JobStatus'
import JobDetail from './pages/JobDetail'
import Notifications from './pages/Notifications'
import DepartmentDetail from './pages/DepartmentDetail'
import MaintenanceDetail from './pages/MaintenanceDetail'
import Insights from './pages/Insights'
import QcHome from './pages/QcHome'
import FgHome from './pages/FgHome'
import PurchaseHome from './pages/PurchaseHome'
import ScanPage from './pages/ScanPage'
import StationHome from './pages/StationHome'
import ViewAsPanel from './pages/ViewAsPanel'
import SignupPage from './pages/SignupPage'
import Approvals from './pages/Approvals'
import UpdatePrompt from './components/UpdatePrompt'
import JobCardModal from './components/JobCardModal'
import { registerNav } from './lib/nav'
import type { SessionUser } from './components/UtilityBars'
import { getUser, isAuthed, logout, getDepartments, getPpcRequest, type ApiUser, type PpcRequest, type Notification } from './lib/api'

export type Screen =
  | 'login'
  | 'home'
  | 'overview'
  | 'create'
  | 'review'
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
  | 'viewas'
  | 'station'
  | 'jobhub'
  | 'ppcinbox'
  | 'purchase'

const FLOOR_ROLES = ['dept_head', 'qc', 'fg_stock', 'maintenance']

function landingFor(u: ApiUser): Screen {
  if (u.username.toLowerCase() === 'admin') return 'viewas' // SuperUser (testing)
  if (u.roles.some((r) => r.role === 'admin')) return 'home' // AASHISH = real admin
  if (u.roles.some((r) => r.role === 'ppc')) return 'ppcrequest'
  if (u.roles.some((r) => r.role === 'qc')) return 'qc'
  if (u.roles.some((r) => r.role === 'fg_stock')) return 'fgclosure'
  return 'station' // production-station floor users land on their station home
}

function toSession(u: ApiUser, depNames: Record<string, string>): SessionUser {
  // The Administrator account is the SuperUser (View As / testing) — show a
  // single clear identity rather than the raw username.
  if (u.username.toLowerCase() === 'admin') return { name: 'SuperUser', role: 'SUPERUSER', id: 'SUPERUSER' }
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
  const [viewAs, setViewAs] = useState<{ id: string; name: string } | null>(null)
  const [selectedPpc, setSelectedPpc] = useState<PpcRequest | null>(null)
  const [reviewMode, setReviewMode] = useState<'admin' | 'ppc'>('admin')
  const [cardJobId, setCardJobId] = useState<string | null>(null)
  const go = (s: Screen) => setScreen(s)
  // open a PPC request as a job sheet; mode decides the available actions and
  // where Back/Done return to (admin → hub, PPC → inbox).
  const openReview = (req: PpcRequest, mode: 'admin' | 'ppc') => {
    setSelectedPpc(req)
    setReviewMode(mode)
    go('review')
  }
  const reviewExit = () => go(reviewMode === 'admin' ? 'jobhub' : 'ppcinbox')

  // A notification taps straight through to the thing it's about.
  async function openNotification(n: Notification, u: SessionUser) {
    // a maintenance ticket → its detail thread
    if (n.ticketId) {
      setMaintTicketId(n.ticketId)
      return go('maintenancedetail')
    }
    // a PPC request (new / proposed / RC / confirmed) → open it directly as a sheet
    if (n.type === 'ppc_approval' && n.entityId) {
      try {
        const { request } = await getPpcRequest(n.entityId)
        return openReview(request, u.role === 'PPC' ? 'ppc' : 'admin')
      } catch {
        return go(u.role === 'PPC' ? 'ppcinbox' : 'jobhub')
      }
    }
    // an approved job → open the printable job card (PPC prints & releases it)
    if (n.jobId) return setCardJobId(n.jobId)
    if (n.type === 'maintenance_alert') return go('maintenance')
    return go(u.role === 'PPC' ? 'ppcinbox' : 'jobhub')
  }

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

  // SuperUser (Administrator) returns to the View As panel; everyone else home.
  const isSuper = (getUser()?.username ?? '').toLowerCase() === 'admin'
  const deptBack = () => go(isSuper ? 'viewas' : 'home')

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
      case 'viewas':
        return (
          <ViewAsPanel
            user={user}
            onLock={handleLock}
            onViewStation={(dept) => {
              setViewAs(dept)
              go('station')
            }}
            onNavigate={go}
          />
        )
      case 'station':
        return (
          <StationHome
            user={user}
            viewAs={viewAs}
            onScan={() => go('scan')}
            onLock={handleLock}
            onReport={() => go('maintenance')}
            onOpenJob={() => go('jobdetail')}
            onExitViewAs={viewAs ? () => { setViewAs(null); go('viewas') } : undefined}
          />
        )
      case 'scan':
        return (
          <ScanPage
            user={user}
            onLock={handleLock}
            onBack={() => go('station')}
            stationName={viewAs?.name}
            stationDepartmentId={viewAs?.id}
          />
        )
      case 'approvals':
        return <Approvals user={user} onBack={() => go('home')} onLock={handleLock} />
      case 'overview':
        return <AdminOverview user={user} onBack={() => go('home')} onLock={handleLock} onOpenInsights={() => go('insights')} />
      case 'insights':
        return <Insights user={user} onBack={() => go('overview')} onLock={handleLock} onOpenJob={() => go('jobdetail')} />
      case 'ppcrequest':
        return (
          <CreateJob
            key="cj-ppc-request"
            variant="ppc"
            user={user}
            onBack={() => go(isSuper ? 'viewas' : 'home')}
            onLock={handleLock}
            onOpenInbox={() => go('ppcinbox')}
          />
        )
      case 'qc':
        return <QcHome user={user} onBack={deptBack} onLock={handleLock} />
      case 'fgclosure':
        return <FgHome user={user} onBack={deptBack} onLock={handleLock} />
      case 'purchase':
        return <PurchaseHome user={user} onBack={deptBack} onLock={handleLock} />
      case 'create':
        return <CreateJob key="cj-create" user={user} onBack={() => go('jobhub')} onLock={handleLock} />
      case 'jobhub':
        return (
          <JobHub
            user={user}
            onBack={() => go(isSuper ? 'viewas' : 'home')}
            onLock={handleLock}
            onNew={() => go('create')}
            onOpen={(reqData) => openReview(reqData, 'admin')}
          />
        )
      case 'review':
        return selectedPpc ? (
          <PpcReviewSheet
            key={`review-${selectedPpc.id}`}
            user={user}
            request={selectedPpc}
            mode={reviewMode}
            onBack={reviewExit}
            onLock={handleLock}
            onDone={reviewExit}
          />
        ) : (
          <JobHub user={user} onBack={() => go('home')} onLock={handleLock} onNew={() => go('create')} onOpen={(r) => openReview(r, 'admin')} />
        )
      case 'ppcinbox':
        return (
          <PpcInbox
            user={user}
            onBack={() => go('ppcrequest')}
            onLock={handleLock}
            onOpen={(reqData) => openReview(reqData, 'ppc')}
          />
        )
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
        return (
          <Notifications
            user={user}
            onBack={() => go(isSuper ? 'viewas' : 'home')}
            onLock={handleLock}
            onOpen={(n) => void openNotification(n, user)}
          />
        )
      case 'home':
      default:
        return <AdminHome user={user} onNavigate={go} onOpenOverview={() => go('overview')} onLock={handleLock} />
    }
  }

  return (
    <>
      {renderScreen()}
      {cardJobId && <JobCardModal jobId={cardJobId} onClose={() => setCardJobId(null)} />}
      <UpdatePrompt />
    </>
  )
}
