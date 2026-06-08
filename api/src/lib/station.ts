import type { AccessPayload } from './auth.js'

// The scanning station is derived from the authenticated user, never from the
// scan payload (docs/10 §3 — prevents station spoofing). A floor user holds a
// department-bound role (dept_head / qc / fg_stock); that department IS the
// station. Admins/PPC hold no station and cannot scan-advance (matches the UI
// rule "admins don't complete steps").
const STATION_ROLES = new Set(['dept_head', 'qc', 'fg_stock', 'maintenance'])

export type StationResolution =
  | { ok: true; departmentId: string }
  | { ok: false; reason: 'no_station' | 'ambiguous'; options?: string[] }

export function resolveStation(user: AccessPayload, explicit?: string): StationResolution {
  const ids = [
    ...new Set(
      user.roles.filter((r) => STATION_ROLES.has(r.role) && r.departmentId).map((r) => r.departmentId as string),
    ),
  ]
  if (explicit) {
    if (ids.includes(explicit)) return { ok: true, departmentId: explicit }
    return { ok: false, reason: 'no_station' }
  }
  if (ids.length === 1) return { ok: true, departmentId: ids[0] }
  if (ids.length === 0) return { ok: false, reason: 'no_station' }
  return { ok: false, reason: 'ambiguous', options: ids }
}
