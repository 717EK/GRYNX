# GRYNX — Database Schema (V1, PostgreSQL)

Conventions: all tables have `id uuid pk`, `created_at`, `updated_at`. Soft-delete via
`status`, never hard delete. All FKs `on delete restrict`. Times stored UTC.

---

## 1. Identity & org

### users
| col | type | notes |
|-----|------|-------|
| username | text unique | |
| full_name | text | |
| password_hash | text null | office users |
| pin_hash | text null | floor users (argon2) |
| status | enum(active, suspended) | |
| last_login_at | timestamptz null | |

### departments
| col | type | notes |
|-----|------|-------|
| code | text unique | e.g. `CNC`, `QC`, `FG` |
| name | text | |
| sort_order | int | |
Seed: Design, Purchase, Laser/Cutting, MS Production, Alloy Production, CNC/VMC, MNTR, Powder Coat, QC, FG Stock, Maintenance.

### role_assignments  *(many-to-many — supports D7, D8)*
| col | type | notes |
|-----|------|-------|
| user_id | fk users | |
| role | enum(admin, ppc, dept_head, qc, fg_stock, maintenance) | |
| department_id | fk departments null | null for global roles (admin, ppc) |
| is_backup | bool default false | D5 backup head |
> A department's **primary** head = `dept_head` row with `is_backup=false`. Multiple backups allowed.

### device_tokens
| col | type | notes |
|-----|------|-------|
| user_id | fk users | |
| platform | enum(web, ios, android, windows) | |
| token | text | VAPID / FCM / APNs token |
| is_floor_device | bool | gates PIN login |

---

## 2. Catalog

### products
`code` (text unique, e.g. `AT`), `name`. Seed: Alloy Truss(AT), MS Truss(MT), Scaffolding(SC), Stage(ST), Mojo(MJ), Lifter(LF), Stacker(SK).

### models
`product_id fk`, `code`, `name` (e.g. GTX 1M/2M/3M). Unique (product_id, code).

### pipeline_templates  *(D9 — multiple per product)*
`product_id fk`, `name`, `is_default bool`.

### pipeline_template_steps
`template_id fk`, `department_id fk`, `sequence int`. Unique (template_id, sequence).

---

## 3. PPC requests

### ppc_requests
| col | type | notes |
|-----|------|-------|
| request_no | text unique | `PR-0001` |
| product_id | fk | |
| priority | enum(normal, urgent) | |
| pipeline_template_id | fk null | |
| start_date / target_date | date null | |
| status | enum(draft, submitted, clarification, approved, rejected, cancelled) | |
| created_by | fk users | PPC |
| clarification_note | text null | Admin's RC note |
| approved_job_id | fk jobs null | set on approval |

### ppc_request_models
`request_id fk`, `model_id fk`, `quantity int`.

---

## 4. Jobs (core)

### jobs
| col | type | notes |
|-----|------|-------|
| job_no | text unique | opaque immutable key (D9) |
| display_label | text | `AT-U-045-060626-001`, regenerable |
| job_type | enum(production, rework) | |
| product_id | fk | immutable (D10) |
| priority | enum(normal, urgent) | editable |
| total_qty | int | editable pre-acceptance |
| status | enum(draft, active, on_hold, in_qc, in_fg, close_requested, closed, cancelled) | |
| pipeline_template_id | fk | snapshot source |
| parent_job_id | fk jobs null | split (D12) |
| source | enum(admin, ppc) | |
| ppc_request_id | fk null | |
| start_date / completion_date | date null | |
| rework_issue | text null | rework only |
| rework_entry_department_id | fk null | rework only |
| created_by | fk users | |
| cancelled_reason | text null | |

### job_models
`job_id fk`, `model_id fk`, `quantity int`.

### job_steps  *(the workflow state machine — one row per pipeline stage, snapshotted at creation)*
| col | type | notes |
|-----|------|-------|
| job_id | fk | |
| department_id | fk | |
| sequence | int | |
| status | enum(pending, waiting_acceptance, in_progress, on_hold, completed, skipped) | |
| accepted_by / accepted_at | fk users / ts | |
| completed_by / completed_at | fk users / ts | |
| sla_due_at | timestamptz null | for escalation (D13) |
Unique (job_id, sequence). The **current step** = lowest sequence not completed/skipped.

---

## 5. Activity, notes, attachments

### job_events  *(immutable timeline — D: "every event timestamped")*
| col | type | notes |
|-----|------|-------|
| job_id | fk | |
| job_step_id | fk null | |
| type | enum(created, accepted, completed, hold, resume, note, update_request, update_reply, qc_result, split, merge, cancelled, closure_requested, closed) | |
| actor_id | fk users | |
| body | text null | ≤2000 chars |
| meta | jsonb | type-specific payload |

### attachments
`job_event_id fk`, `kind enum(image, pdf, video)`, `object_key text`, `mime`, `size_bytes`, `width/height null`. Limit enforced in API (≤10 images/event, video ≤30s) per D14.

### holds
`job_step_id fk`, `reason_code enum(material, breakdown, approval, resource, other)`, `reason_text text null` (required if `other`), `created_by`, `resolved_at null`, `escalation_level int default 0`.

---

## 6. QC, rework, closure

### qc_inspections
`job_id fk`, `result enum(approved, rework)`, `inspector_id fk`, `notes text` (required when result=rework — D: 5.2), `rework_job_id fk null`.

### closures
`job_id fk`, `requested_by fk` (FG), `requested_at`, `approved_by fk null` (Admin), `approved_at null`, `status enum(requested, approved, rejected)`, `received_qty int`.

---

## 7. Maintenance

### maintenance_tickets
| col | type | notes |
|-----|------|-------|
| ticket_no | text unique | `MT-0001` |
| category | enum(electrical, mechanical, utility, facility, it_network, safety, other) | D16 |
| priority | enum(critical, high, normal, low) | |
| status | enum(open, assigned, in_progress, completed, verified, closed) | |
| location_text | text | machine/area |
| description | text | |
| reported_by | fk users | |
| assigned_to | fk users null | maintenance head/tech |
| closed_by | fk users null | |

### maintenance_events
`ticket_id fk`, `type`, `actor_id`, `body`, `created_at` (mirror of job_events for maintenance timeline).

---

## 8. Notifications

### notifications
`user_id fk`, `type enum(new_job, update_request, hold_alert, ppc_approval, maintenance_alert, closure_request, escalation)`, `job_id fk null`, `ticket_id fk null`, `body text`, `read_at null`.

---

## 9. Audit
### audit_log
`entity text`, `entity_id uuid`, `action text`, `actor_id fk`, `before jsonb null`, `after jsonb null`, `at timestamptz`. Written on every mutation.

---

## 10. Sequences
### daily_sequences
`scope text` (e.g. `job:AT:2026-06-06`), `last_value int`. Atomic increment for the `001` daily counter. Separate scopes for jobs, rework, PR, MT.

---

## 13. Reserved for V2 (serial traceability — D19, build later, no V1 logic)
- `serials(id, serial_no, job_id, model_id, produced_on, status)`
- `serial_genealogy(serial_id, department_id, operator_id, batch_ref, vendor_ref, qc_ref)`
These FK into existing `jobs/models` so adding them does not alter V1 tables.
