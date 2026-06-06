# GRYNX — API Structure (V1)

REST + JSON over HTTPS. Live updates via WebSocket. All mutating routes are
RBAC-guarded (doc 04) and write `audit_log`. All list routes paginate + filter.
Mutations accept an `Idempotency-Key` header (offline queue safety, D3).

Base: `/api/v1`

## Auth
| Method | Route | Who | Notes |
|--------|-------|-----|-------|
| POST | `/auth/login/password` | office | username+password → JWT+refresh |
| POST | `/auth/login/pin` | floor | username+PIN, floor device only |
| POST | `/auth/refresh` | all | rotate refresh token |
| POST | `/auth/logout` | all | revoke device token |
| POST | `/auth/devices` | all | register push/device token |

## Users & org (Admin)
`GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/roles` · `DELETE /users/:id/roles/:rid`
`GET /departments` · `GET/POST /departments/:id/heads` (primary/backup)

## Catalog
`GET/POST /products` · `GET/POST /products/:id/models`
`GET/POST /products/:id/pipelines` · `PATCH /pipelines/:id` (Admin)

## PPC requests
| Method | Route | Who |
|--------|-------|-----|
| GET | `/ppc-requests` (filter status) | PPC, Admin |
| POST | `/ppc-requests` | PPC |
| PATCH | `/ppc-requests/:id` (edit while draft/clarification) | PPC |
| POST | `/ppc-requests/:id/submit` | PPC |
| POST | `/ppc-requests/:id/cancel` (pre-approval) | PPC |
| POST | `/ppc-requests/:id/clarify` (RC + note) | Admin |
| POST | `/ppc-requests/:id/approve` → creates job | Admin |
> Approve is transactional: allocates job_no, snapshots pipeline → job_steps, generates Job Sheet PDF, notifies first department head.

## Jobs
| Method | Route | Who | Notes |
|--------|-------|-----|-------|
| GET | `/jobs` (filter: status, dept, priority, product) | role-scoped | floor sees own dept queue |
| GET | `/jobs/:id` | role-scoped | full record |
| GET | `/jobs/:id/timeline` | role-scoped | from job_events |
| POST | `/jobs` | Admin | direct creation |
| PATCH | `/jobs/:id` | Admin | priority/schedule anytime; qty/models pre-acceptance only (D10) |
| POST | `/jobs/:id/cancel` | Admin | reason required |
| GET | `/jobs/:id/sheet.pdf` | role-scoped | barcode + QR |
| POST | `/jobs/:id/split` | PPC | parent→children (D12) |

### Workflow (the engine — only path that moves steps)
| Method | Route | Who |
|--------|-------|-----|
| POST | `/jobs/:id/steps/current/accept` | current dept head |
| POST | `/jobs/:id/steps/current/complete` | current dept head |
| POST | `/jobs/:id/steps/current/hold` (reason) | current dept head |
| POST | `/jobs/:id/steps/current/resume` | current dept head |
| POST | `/jobs/:id/notes` (body + attachments) | current dept head |
| POST | `/jobs/:id/update-request` | Admin |
| POST | `/jobs/:id/update-reply` (body + attachments) | current dept head |

## QC / Rework / Closure
`POST /jobs/:id/qc` { result: approved \| rework, notes } → on approve forwards to FG; on rework creates linked rework job.
`POST /jobs/:id/closure` (FG requests, received_qty) · `POST /closures/:id/approve|reject` (Admin).

## Maintenance
`GET/POST /maintenance` · `POST /maintenance/:id/assign` · `/start` · `/complete` · `/verify` · `/close`.

## Notifications
`GET /notifications` (unread filter) · `POST /notifications/:id/read` · WS channel `user:{id}` for live push.

## Dashboard / export
`GET /dashboard` (KPIs: active, delayed/SLA-breached, dept load, holds, avg completion).
`GET /reports/jobs.csv|.xlsx` · `GET /reports/...pdf`.

## Attachments
`POST /uploads` → returns signed PUT URL + object_key; client uploads direct to object store, then references key in the note/event.

## Errors & realtime
- Standard envelope: `{ error: { code, message, fields? } }`.
- WS events: `job.updated`, `job.step.changed`, `notification.new` scoped by room (department, user).
