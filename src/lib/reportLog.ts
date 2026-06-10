// A tiny in-memory ring buffer of recent app events, captured so the feedback
// reporter can attach "the log" alongside a bug report (per the floor team's ask).
export type LogEntry = { t: string; level: 'error' | 'warn' | 'info' | 'nav'; msg: string }

const MAX = 60
const buf: LogEntry[] = []

function push(level: LogEntry['level'], msg: string) {
  buf.push({ t: new Date().toISOString(), level, msg: msg.slice(0, 500) })
  if (buf.length > MAX) buf.shift()
}

/** Recent breadcrumbs/errors, oldest → newest. */
export function getLog(): LogEntry[] {
  return buf.slice()
}

/** Drop a navigation/UX breadcrumb (e.g. screen changes). */
export function breadcrumb(msg: string) {
  push('nav', msg)
}

let patched = false
/** Capture console.error/warn + uncaught errors into the ring buffer. Idempotent. */
export function startReportLog() {
  if (patched || typeof window === 'undefined') return
  patched = true
  const fmt = (args: unknown[]) =>
    args.map((a) => {
      if (a instanceof Error) return a.message
      if (typeof a === 'string') return a
      try { return JSON.stringify(a) } catch { return String(a) }
    }).join(' ')

  const origErr = console.error.bind(console)
  const origWarn = console.warn.bind(console)
  console.error = (...args: unknown[]) => { push('error', fmt(args)); origErr(...args) }
  console.warn = (...args: unknown[]) => { push('warn', fmt(args)); origWarn(...args) }

  window.addEventListener('error', (e) => push('error', `${e.message} @ ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => push('error', `unhandledrejection: ${fmt([e.reason])}`))
  breadcrumb('app started')
}
