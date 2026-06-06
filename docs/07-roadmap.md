# GRYNX — Development Roadmap (V1)

Sequence chosen so a usable slice of the factory workflow is testable as early as
possible, then hardened. Each phase ends with something demoable on the floor.

## Phase 0 — Foundations
- Repo + `@grynx/core` (types, API client, zod, permission helper).
- DB schema + migrations (doc 02), seed departments/products/models.
- Auth (PIN + password), JWT/refresh, RBAC middleware.
- App shell (PWA), theme/token layer ready for branding assets.
- CI + cloud environment (deploy pipeline, object store, Postgres, Redis).

## Phase 1 — Core production loop (the heart)
- Job creation (Admin direct): job-ID/label service, pipeline snapshot → job_steps.
- Department workflow engine: accept → in-progress → hold/resume → complete → next.
- Job detail + timeline + dept queue UI (Urgent-first).
- Notes + image upload (signed URLs).
**Milestone:** a job can be created and walked through all departments on tablets.

## Phase 2 — PPC + approvals + closure
- PPC request create/edit/submit/cancel; Admin RC + Approve→Job.
- QC approve / rework; rework job creation with entry point.
- FG closure request → Admin approve/close.
**Milestone:** full create→produce→QC→FG→close lifecycle end-to-end.

## Phase 3 — Notifications, SLA, documents
- Notification dispatcher + Web Push; in-app bell.
- Scheduler: acceptance SLA + hold escalations (backup→Admin).
- Job Sheet PDF (Code-128 barcode + QR); barcode scan → job detail.

## Phase 4 — Maintenance + dashboard + export
- Maintenance ticket lifecycle.
- Dashboard KPIs (active/delayed/load/holds/avg completion).
- CSV/Excel/PDF export.

## Phase 5 — Offline-tolerance + hardening
- Offline read cache + queued floor actions (idempotency).
- Audit-log coverage, rate-limit/lockout, signed-URL expiry.
- Load/QA pass, accessibility & big-touch review on real tablets.

## Phase 6 — Pilot → native readiness
- Pilot deployment on factory tablets/desktops; gather feedback.
- Native shells (React Native iOS/Android, Tauri Windows) reusing `@grynx/core`.
- Swap Web Push → FCM/APNs via device_tokens (no business-logic change).

## Explicitly deferred to V2+
Serial traceability (hooks reserved), parallel auto-merge, Sales/Store/Inventory/
Vendor/Customer/Project modules, analytics suite, document/drawing management, OTP.

---

### Before build starts (owner inputs — see doc 00)
1. Branding assets (logos, fonts, colors, UI screenshots).
2. Per-product default pipelines (department order).
3. Confirm maintenance category list.
4. Sign-off on this architecture set (docs 00–07).
