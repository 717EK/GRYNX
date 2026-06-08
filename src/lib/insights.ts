// ============================================================
// GRYNX Factory Intelligence — Phase 1 (rule-based, no LLM)
//
// Per the AI strategy: AI is an ASSISTANT, not a manager. This layer only
// READS state and produces SUGGESTIONS + SUMMARIES that a human acts on. It
// never approves/creates/assigns/closes jobs.
//
// The InsightsProvider interface lets us swap the rule engine for an LLM-backed
// provider later (local model on the Mac Mini / RTX, or Claude API) without
// touching the UI — same suggestions/summary shapes, richer reasoning.
// ============================================================

export interface JobSnapshot {
  id: string
  product: string
  qty: number
  dept: string
  priority: 'urgent' | 'normal'
  status: 'in_progress' | 'waiting' | 'on_hold'
  hoursAtStation: number
  holdHours?: number
  holdReason?: string
}

export interface FactoryState {
  jobs: JobSnapshot[]
  pendingApprovals: number
  closureRequests: number
}

export type SuggestionKind = 'update_request' | 'escalation' | 'bottleneck' | 'hold_review' | 'approval'
export type Severity = 'info' | 'warn' | 'alert'

export interface Suggestion {
  id: string
  kind: SuggestionKind
  severity: Severity
  title: string
  detail: string
  jobId?: string
  action: string // the human action this proposes; nothing happens until a person taps it
}

export interface DailySummary {
  active: number
  completedToday: number
  delayed: number
  onHold: number
  topBottleneck: string
  headline: string
}

export interface InsightsProvider {
  summarize(state: FactoryState): DailySummary
  suggestions(state: FactoryState): Suggestion[]
}

// --- Tunable thresholds (would live in Admin settings) ---
const STATION_SLA_BASE_HOURS = 2 // "every couple of hours"
const STATION_SLA_PER_25_UNITS = 1 // +1h of grace for every 25 units (bigger jobs get longer)
const STATION_SLA_CAP_HOURS = 10
const HOLD_ESCALATE_HOURS = 72

/** Allowed time at a station before a nudge — scales with job size. */
export function stationSlaHours(qty: number): number {
  const scaled = STATION_SLA_BASE_HOURS + Math.floor(qty / 25) * STATION_SLA_PER_25_UNITS
  return Math.min(scaled, STATION_SLA_CAP_HOURS)
}

export class RuleBasedInsights implements InsightsProvider {
  summarize(state: FactoryState): DailySummary {
    const active = state.jobs.filter((j) => j.status !== 'on_hold').length
    const onHold = state.jobs.filter((j) => j.status === 'on_hold').length
    const delayed = state.jobs.filter(
      (j) => j.status === 'in_progress' && j.hoursAtStation > stationSlaHours(j.qty),
    ).length
    // crude bottleneck = department with the most non-hold jobs sitting on it
    const load: Record<string, number> = {}
    for (const j of state.jobs) load[j.dept] = (load[j.dept] || 0) + 1
    const topBottleneck = Object.entries(load).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
    return {
      active,
      completedToday: 17,
      delayed,
      onHold,
      topBottleneck,
      headline: `${active} active · ${delayed} over SLA · ${onHold} on hold. Heaviest load: ${topBottleneck}.`,
    }
  }

  suggestions(state: FactoryState): Suggestion[] {
    const out: Suggestion[] = []

    // 1) Auto-update rule — job sitting at a station past its size-scaled SLA
    for (const j of state.jobs) {
      if (j.status === 'in_progress') {
        const sla = stationSlaHours(j.qty)
        if (j.hoursAtStation > sla) {
          out.push({
            id: `upd-${j.id}`,
            kind: 'update_request',
            severity: j.hoursAtStation > sla * 2 ? 'alert' : 'warn',
            title: `Request update — ${j.dept}`,
            detail: `${j.id} has been at ${j.dept} for ${j.hoursAtStation}h (SLA ${sla}h for ${j.qty} units).`,
            jobId: j.id,
            action: 'Send update request',
          })
        }
      }
    }

    // 2) Long holds → escalate
    for (const j of state.jobs) {
      if (j.status === 'on_hold' && (j.holdHours ?? 0) >= HOLD_ESCALATE_HOURS) {
        out.push({
          id: `esc-${j.id}`,
          kind: 'escalation',
          severity: 'alert',
          title: `Escalate hold — ${j.dept}`,
          detail: `${j.id} on hold ${j.holdHours}h (${j.holdReason}). Past the ${HOLD_ESCALATE_HOURS}h threshold.`,
          jobId: j.id,
          action: 'Escalate to Admin',
        })
      }
    }

    // 3) Bottleneck detection
    const load: Record<string, number> = {}
    for (const j of state.jobs) if (j.status !== 'on_hold') load[j.dept] = (load[j.dept] || 0) + 1
    const [dept, n] = Object.entries(load).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
    if (n >= 3) {
      out.push({
        id: `btl-${dept}`,
        kind: 'bottleneck',
        severity: 'warn',
        title: `Bottleneck forming — ${dept}`,
        detail: `${n} jobs queued at ${dept}. Consider rebalancing or adding a shift.`,
        action: 'Review department load',
      })
    }

    // 4) Approvals waiting
    if (state.pendingApprovals > 0) {
      out.push({
        id: 'appr',
        kind: 'approval',
        severity: 'info',
        title: `${state.pendingApprovals} PPC request${state.pendingApprovals > 1 ? 's' : ''} awaiting approval`,
        detail: 'Approving creates the job at the first department.',
        action: 'Review PPC requests',
      })
    }

    // alert first, then warn, then info
    const rank = { alert: 0, warn: 1, info: 2 }
    return out.sort((a, b) => rank[a.severity] - rank[b.severity])
  }
}

// Sample state so the UI renders without a backend.
export const SAMPLE_STATE: FactoryState = {
  pendingApprovals: 2,
  closureRequests: 1,
  jobs: [
    { id: 'AT-U-045-080626-001', product: 'Alloy Truss', qty: 45, dept: 'CNC / VMC', priority: 'urgent', status: 'in_progress', hoursAtStation: 9 },
    { id: 'MT-N-030-070626-002', product: 'MS Truss', qty: 30, dept: 'MS Production', priority: 'normal', status: 'in_progress', hoursAtStation: 3 },
    { id: 'SC-N-018-060626-006', product: 'Scaffolding', qty: 18, dept: 'CNC / VMC', priority: 'normal', status: 'in_progress', hoursAtStation: 5 },
    { id: 'ST-N-012-050626-004', product: 'Stage', qty: 12, dept: 'Powder Coat', priority: 'normal', status: 'on_hold', hoursAtStation: 8, holdHours: 74, holdReason: 'Machine Breakdown' },
    { id: 'LF-N-009-050626-007', product: 'Lifter', qty: 9, dept: 'CNC / VMC', priority: 'normal', status: 'in_progress', hoursAtStation: 2 },
  ],
}

export const insights: InsightsProvider = new RuleBasedInsights()
