import { useEffect, useState } from 'react'
import { TopBar, BottomBar, type SessionUser } from '../components/UtilityBars'
import { getNotifications, markNotificationRead, markAllNotificationsRead, type Notification } from '../lib/api'
import './Notifications.css'

const ICON: Record<string, string> = {
  new_job: '＋',
  update_request: '↻',
  hold_alert: '‖',
  ppc_approval: '✓',
  maintenance_alert: '⚙',
  closure_request: '◳',
  escalation: '⚠',
}

function ago(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function Notifications({
  user,
  onBack,
  onLock,
  onOpen,
}: {
  user: SessionUser
  onBack: () => void
  onLock: () => void
  onOpen: (n: Notification) => void
}) {
  const [items, setItems] = useState<Notification[] | null>(null)

  async function load() {
    try {
      const { notifications } = await getNotifications()
      setItems(notifications)
    } catch {
      setItems([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const unread = items?.filter((n) => !n.readAt).length ?? 0

  async function open(n: Notification) {
    if (!n.readAt) {
      markNotificationRead(n.id).catch(() => {})
      setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? xs)
    }
    onOpen(n)
  }

  async function readAll() {
    await markAllNotificationsRead().catch(() => {})
    setItems((xs) => xs?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? xs)
  }

  return (
    <div className="app">
      <TopBar user={user} onLock={onLock} />
      <main className="app__body screen">
        <header className="screen__head">
          <button className="screen__back" onClick={onBack} aria-label="Back">←</button>
          <div className="screen__titles">
            <h1 className="screen__title display">Notifications</h1>
            <span className="mono-label">{unread} Unread</span>
          </div>
          <button className="notif__readall mono-label" onClick={readAll}>Mark all read</button>
        </header>
        <div className="screen__scroll">
          {items === null ? (
            <span className="nsec__title mono-label" style={{ display: 'block', textAlign: 'center', padding: 30 }}>Loading…</span>
          ) : items.length === 0 ? (
            <span className="nsec__title mono-label" style={{ display: 'block', textAlign: 'center', padding: 30 }}>No notifications.</span>
          ) : (
            <div className="nlist">
              {items.map((n) => (
                <button key={n.id} className={`notif ${n.readAt ? '' : 'is-unread'}`} onClick={() => open(n)}>
                  <span className={`notif__icon notif__icon--${n.type}`}>{ICON[n.type] ?? '•'}</span>
                  <span className="notif__body">
                    <span className="notif__text">{n.body}</span>
                  </span>
                  <span className="notif__at mono-label">{ago(n.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
      <BottomBar />
    </div>
  )
}
