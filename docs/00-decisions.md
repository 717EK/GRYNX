# GRYNX — Decision Log (V1)

Company: **D-LYFT** · Product: **GRYNX** · Tagline: *Track. Sync. Execute.*

This log records every architectural decision and the rationale. It is the single
source of truth for "why" — update it whenever a decision changes.

---

## Confirmed by business owner (2026-06-06)

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Platform (pilot) | **React + TypeScript PWA** | One codebase, installable on iPad/desktop/phone, instant deploys. |
| D2 | Platform (future) | **Web + React Native (iOS/Android) + Tauri (Windows)** | Shared core; native push & store presence later without a rewrite. |
| D3 | Hosting | **Cloud + offline-tolerant reads** | Cloud source of truth; cached views + queued actions on brief wifi loss. NOT full offline. |
| D4 | Auth | **PIN on floor tablets, username+password in office** | Floor speed vs. back-office security. OTP deferred to V2. |
| D5 | Head redundancy | **Backup head → escalate to Admin** | No job silently stalls; Admin is not the first catch-all. |
| D6 | Mobile notifications | **Required** — Web Push (pilot) → FCM/APNs (native) | Provider-agnostic notification layer so this is a swap, not a rewrite. |

## Architect recommendations (defaulted — owner may veto)

| # | Area | Decision |
|---|------|----------|
| D7 | Multiple Admins | Supported from day one (no single point of approval). |
| D8 | Multi-role users | A user may hold multiple roles/departments (PRATIK = CNC + QC). |
| D9 | Job ID | Opaque immutable internal ID is the key; the `AT-U-045-...` string is a **display label**, regenerated if qty/priority change. Barcode encodes the opaque ID. |
| D10 | Job edits | Priority/Schedule editable anytime; Qty/Models editable only before first dept accepts; Product never editable. |
| D11 | Cancellation | Soft status only, never hard delete (traceability). Admin cancels jobs; PPC cancels requests pre-approval only. |
| D12 | Parallel split | Parent/child modeled in schema; **auto-merge UX deferred to V2**. V1 splits flow as linked, visually grouped jobs. |
| D13 | Acceptance SLA | Default 24h (configurable per priority); drives escalation engine. |
| D14 | Attachments | Images (≤10/update) + PDF + short video (≤30s). |
| D15 | Rework | Separate job, entry-point department, created by Admin/QC/Heads. |
| D16 | Maintenance priority | Critical / High / Normal / Low. |
| D17 | Closure | FG Stock requests; Admin approves; soft-close status. |
| D18 | Long hold escalation | Notify head @24h, Admin @72h, dashboard flag @7d (configurable). |
| D19 | Serial traceability | Schema hooks reserved now; no V1 build. |

## Pending owner input (non-blocking for architecture)

- Branding assets (D-LYFT + GRYNX logos, fonts, colors, UI screenshots) — **source of truth for all UI work**, needed before UI build begins.
- Final per-product default pipelines (department order per product).
- Confirm maintenance category list (proposed: Electrical, Mechanical, Utility, Facility, IT/Network, Safety, Other).
