import { useRegisterSW } from 'virtual:pwa-register/react'
import './UpdatePrompt.css'

// Watches for a newly deployed version and prompts the user to update.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      // poll for a new build every 60s while the app is open
      if (reg) setInterval(() => reg.update(), 60_000)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-toast" role="status">
      <span className="update-toast__dot" />
      <span className="update-toast__text">
        <b>New version available</b>
        <span className="mono-label">A GRYNX update is ready to install</span>
      </span>
      <button className="update-toast__btn" onClick={() => updateServiceWorker(true)}>
        Update
      </button>
      <button className="update-toast__x" onClick={() => setNeedRefresh(false)} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
