import { scan, newIdempotencyKey } from './api'

// Offline-first scan queue. A scan that can't reach the server (Wi-Fi blip) is
// persisted locally and replayed automatically when connectivity returns. Safe
// because the scan engine is idempotent (the stored idempotencyKey dedupes a
// replay) and order-aware (the original clientTs is preserved).
export interface QueuedScan {
  jobNo: string
  idempotencyKey: string
  clientTs: string
  stationDepartmentId?: string
  stationId?: string
  parallel?: boolean
  remark?: string
  photoUrl?: string
}

const KEY = 'grynx-scan-queue'
let queue: QueuedScan[] = load()
const listeners = new Set<(n: number) => void>()
let flushing = false
let started = false

function load(): QueuedScan[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}
function persist() {
  localStorage.setItem(KEY, JSON.stringify(queue))
  listeners.forEach((l) => l(queue.length))
}

export const queuedScanCount = () => queue.length
export function onScanQueueChange(fn: (n: number) => void) {
  listeners.add(fn)
  fn(queue.length)
  return () => void listeners.delete(fn)
}

// Queue a scan to apply later. Generates the idempotency key once so replays
// never double-apply.
export function enqueueScan(item: { jobNo: string; stationDepartmentId?: string; stationId?: string; parallel?: boolean; remark?: string; photoUrl?: string; clientTs?: string }) {
  queue.push({
    jobNo: item.jobNo,
    stationDepartmentId: item.stationDepartmentId,
    stationId: item.stationId,
    parallel: item.parallel,
    remark: item.remark,
    photoUrl: item.photoUrl,
    idempotencyKey: newIdempotencyKey(),
    clientTs: item.clientTs ?? new Date().toISOString(),
  })
  persist()
  void flushScanQueue()
}

// Try to deliver queued scans, oldest first. Stops on a network error or a 5xx
// (server transient) so it retries later; drops anything the server actually
// answered (applied / duplicate / out-of-seq / 4xx — it was delivered).
export async function flushScanQueue() {
  if (flushing || queue.length === 0) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  flushing = true
  try {
    while (queue.length) {
      const s = queue[0]
      try {
        const { status } = await scan({ jobNo: s.jobNo, idempotencyKey: s.idempotencyKey, clientTs: s.clientTs, stationDepartmentId: s.stationDepartmentId, stationId: s.stationId, parallel: s.parallel, remark: s.remark, photoUrl: s.photoUrl })
        if (status >= 500 || status === 401) break // server transient / not authed yet — retry later
        queue.shift()
        persist()
      } catch {
        break // no response (offline) — keep and retry later
      }
    }
  } finally {
    flushing = false
  }
}

// Idempotent: flush on reconnect + periodically + once now.
export function startScanQueue() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('online', () => void flushScanQueue())
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void flushScanQueue() })
  setInterval(() => void flushScanQueue(), 8_000)
  void flushScanQueue()
}
