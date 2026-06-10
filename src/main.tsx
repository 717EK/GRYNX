import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'
import { initNative } from './lib/native'
import { startScanQueue } from './lib/scanQueue'
import { startReportLog } from './lib/reportLog'

// capture console errors / breadcrumbs before anything else runs
startReportLog()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// native (Capacitor) startup — no-op on the web build
void initNative()
// keep the offline scan queue draining in the background (reconnect + every 20s)
startScanQueue()
