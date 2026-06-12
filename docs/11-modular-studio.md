# 11 — Modular Studio (the next major)

> Goal, in Vivek's words: *every aspect editable*. Universal UI/UX (alignment,
> spacing, theming handled by the system — zero time wasted on design), pages
> composed from parts, each part attached to a function in a **node editor**,
> with logic edited there too — so the app can be reshaped on the go without a
> developer rebuilding it.

This document is the **capability catalog**: everything such a studio *can*
make editable, grouped into layers. We pick scope from this list and phase it.
(Status: catalog only — nothing here is built yet. Floor beta runs on v0.8.x.)

---

## Layer 0 — Universal design system (the "never touch CSS again" layer)

The studio never asks "what color / how many pixels". Everything inherits.

| # | Capability | What becomes editable |
|---|---|---|
| 0.1 | **Design tokens** | One global theme: brand color, surface palette, type scale, spacing scale, radii, shadows. Change once → every screen updates. |
| 0.2 | **Layout primitives** | Stack / Grid / Split with universal alignment + gap rules. Pages are built from these — no margins, no manual breakpoints, ever. |
| 0.3 | **Auto-responsive** | Each widget knows its phone / tablet / desktop rendering. A page built once works on all three (like the current fluid scaling, but automatic). |
| 0.4 | **Density & theme modes** | Floor-dark vs desk-warm per surface; compact vs comfortable density. |
| 0.5 | **Standard states** | Loading / empty / error states are built into every widget — never designed per page. |

## Layer 1 — Widget palette (the parts pages are made of)

A fixed, well-made library — the *only* UI anyone composes with:

- **Display:** stat tile, KPI row, list row, data table, timeline, stepper/pipeline,
  badge/chip, progress bar, bar/line/donut chart, photo gallery, calendar
- **Input:** form group (text/number/date/select/toggle), search box, qty stepper,
  PIN pad, signature pad, photo capture (auto-compressed), file attach
- **Action:** button row, swipe action, FAB, **scan trigger** (camera/QR — wired to
  the scan engine), print trigger (document templates)
- **Containers:** card, section, modal/sheet, tab set, banner/notice
- **Factory-specific:** job row, station occupancy cell, material-need row,
  approval row, operator avatar — pre-bound to our entities

Each widget = name + slots + bindable properties. New widget types are the
*only* thing that still needs a developer.

## Layer 2 — Page builder

| # | Capability |
|---|---|
| 2.1 | **Create/edit pages**: pick a layout primitive, drop widgets into slots, reorder. Saved as a JSON page-schema in the DB, rendered by one universal renderer. |
| 2.2 | **Navigation editing**: what's in each role's menu/tabs, what each button navigates to, back behavior. |
| 2.3 | **Role landing**: which page each role lands on after login. |
| 2.4 | **Page visibility**: per role / per condition (e.g. only when job.status=closed). |
| 2.5 | **Popups/panels**: any page can open as a popup on desktop (already proven by the v0.7.3 reskin) — automatic. |

## Layer 3 — Data binding ("attach each part to a function")

| # | Capability |
|---|---|
| 3.1 | **Query binding**: bind any display widget to an entity query — entity, filters, sort, limit, live-refresh. ("this table = jobs where status=in_qc, newest first") |
| 3.2 | **Action binding**: bind any button/swipe/scan to an action — create/update record, change status, call a flow (Layer 4), open page, print document, send notification. |
| 3.3 | **Form binding**: form fields ↔ entity fields, with validation rules (required, max, regex, unique) set per field. |
| 3.4 | **Computed values**: expressions on bound data (qty × rate, days-since, % complete). |
| 3.5 | **Aggregations**: count/sum/avg/group-by for stat tiles and charts (the analytics builder — "avg dwell by station" becomes a saved metric anyone can place). |

## Layer 4 — Logic & workflow (the node editor proper)

The canvas Vivek described: nodes = pages, states, and logic; edges = movement.

| # | Capability |
|---|---|
| 4.1 | **Flow map (read-only first)**: auto-generated graph of every page, role landing, transition, and the workflow state machine — with the logic behind each node inspectable. The system becomes legible before it becomes editable. |
| 4.2 | **Workflow editor**: stages (gates), what arms/completes them, who can act, terminal events. Editing this = pipeline-v3 without code. |
| 4.3 | **Trigger rules**: WHEN (scan, status change, form submit, SLA timer, schedule) → IF (conditions: priority, product, role, value compare) → THEN (notify, set field, create record, require approval, block with message). |
| 4.4 | **Guard rules**: validations that block actions ("can't close without ≥1 serial", "rework requires a note") — currently code, becomes nodes. |
| 4.5 | **Approval chains**: N-step approvals with roles, used anywhere (PPC approve, closure, custom). |
| 4.6 | **Timers/escalations**: SLA definitions and what happens on breach (today: hardcoded sweep). |
| 4.7 | **Notification rules**: event → audience (role/dept/user) → channel (in-app/push) → message template with field placeholders. |

## Layer 5 — Data model

| # | Capability |
|---|---|
| 5.1 | **Custom fields** on existing entities (job, sheet, ticket…) — typed, validated, instantly bindable + printable. |
| 5.2 | **New entities** ("registers"): define fields → CRUD pages, list widgets and API appear automatically (e.g. a dispatch register, a vendor list). |
| 5.3 | **Catalogues editable in-app**: products, models/sizes, stations, hold reasons, numbering format (job-ID scheme) — most already DB rows, needs UI. |

## Layer 6 — Documents

| # | Capability |
|---|---|
| 6.1 | **Template editor** for printables (job card, production record, sale sheet, custom): blocks (header, field grid, table, barcode/QR, photo, signature line) bound to entity fields. |

## Layer 7 — Roles & permissions

| # | Capability |
|---|---|
| 7.1 | **Role manager**: create roles, assign users, set landing page. |
| 7.2 | **Permission matrix**: per role × per page / per action / per field (view, edit). |

## Layer 8 — Safety rails (non-negotiable for a factory)

| # | Capability |
|---|---|
| 8.1 | **Draft → preview → publish**: edits never hit the floor live; preview as any role; one-tap rollback to any version. |
| 8.2 | **Change audit**: who changed which node/page/rule, when, diff view. |
| 8.3 | **In-flight policy**: when a workflow changes, running jobs either finish on the old flow or migrate explicitly — never silently break. |
| 8.4 | **Export/import**: the whole app definition as JSON — backup, copy to a second factory, version control. |

---

## What this is, honestly

This is a **domain-specific low-code platform** (Retool/FlutterFlow class, but
scoped to D-LYFT's factory domain — which is what makes it feasible). The deep
technical shifts: pages stop being React files and become **JSON schemas in the
DB rendered by one universal renderer**; logic stops being route code and
becomes **rule definitions run by an interpreter**. Existing screens migrate
gradually — the studio and the hardcoded app coexist (hybrid), so the floor
never stops.

**Build order that doesn't bet the factory:**
1. Layer 0 + 1 + 2.1 (tokens, palette, page renderer) → recreate ONE existing simple page as schema to prove the renderer.
2. Layer 4.1 (read-only flow map) → immediate visibility win.
3. Layer 3 (binding) → studio pages become functional.
4. Layer 4.3/4.4/4.7 (triggers, guards, notifications) on the interpreter.
5. Layer 5–7, then 4.2 (workflow editing) LAST, behind 8.1–8.3.

**What would worry an experienced MES architect:** (a) building the editor
before the renderer/interpreter — the editor is the *easy* 20%; (b) editable
workflow without draft/publish + in-flight policy — a misclick reroutes the
factory; (c) scope creep toward "generic app builder" — every capability above
must stay bound to OUR entities and OUR widget palette, or it never ships.
