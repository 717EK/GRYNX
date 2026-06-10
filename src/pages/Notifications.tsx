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
  const [cat, setCat] = useState<string>('all')

  async function load() {
    try {
      const { notifications } = await getNotifications(true) // unread queue only
      setItems(notifications)
    } catch {
      setItems([])
    }
  }
  useEffect(() => {
    void load()
  }, [])

  const unread = items?.filter((n) => !n.readAt).length ?? 0
  // bifurcate the feed so it isn't one undifferentiated list
  const inCat = (n: Notification, key: string) => {
    if (key === 'all') return true
    if (key === 'ppc') return n.type === 'ppc_approval'
    if (key === 'maint') return n.type === 'maintenance_alert' || !!n.ticketId
    if (key === 'jobs') return n.type !== 'ppc_approval' && n.type !== 'maintenance_alert' && !n.ticketId
    return true
  }
  const CATS = [
    { key: 'all', label: 'All' },
    { key: 'ppc', label: 'PPC' },
    { key: 'jobs', label: 'Jobs' },
    { key: 'maint', label: 'Maintenance' },
  ]
  // the feed is a live "needs attention" queue — attended (read) items clear out
  const filtered = (items ?? []).filter((n) => !n.readAt && inCat(n, cat))
  const catUnread = (key: string) => (items ?? []).filter((n) => !n.readAt && inCat(n, key)).length

  async function open(n: Notification) {
    // attend → clear: mark read (removes it from the queue) then open the target
    if (!n.readAt) {
      markNotificationRead(n.id).catch(() => {})
      setItems((xs) => xs?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? xs)
      window.dispatchEvent(new Event('grynx-notif-changed')) // refresh the bell badge now
    }
    onOpen(n)
  }

  async function readAll() {
    await markAllNotificationsRead().catch(() => {})
    setItems((xs) => xs?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? xs)
    window.dispatchEvent(new Event('grynx-notif-changed'))
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
        {items && items.length > 0 && (
          <div className="notif__cats">
            {CATS.map((c) => {
              const u = catUnread(c.key)
              return (
                <button key={c.key} className={`notif__cat mono-label ${cat === c.key ? 'is-active' : ''}`} onClick={() => setCat(c.key)}>
                  {c.label}{u > 0 && <span className="notif__cat-n">{u}</span>}
                </button>
              )
            })}
          </div>
        )}
        <div className="screen__scroll">
          {items === null ? (
            <span className="nsec__title mono-label" style={{ display: 'block', textAlign: 'center', padding: 30 }}>Loading…</span>
          ) : filtered.length === 0 ? (
            <span className="nsec__title mono-label" style={{ display: 'block', textAlign: 'center', padding: 30 }}>✓ All clear — no pending {cat === 'all' ? '' : cat + ' '}notifications.</span>
          ) : (
            <div className="nlist">
              {filtered.map((n) => (
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
