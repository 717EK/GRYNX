# 12 — Hierarchical Workflow Engine (metadata-driven)

> **Status: CONFIRMED plan** (all open questions resolved — see §8). Captures
> Vivek's 2026-06-12 flow + decisions: free-scan production; full-logic editor as
> the destination (built in 3 rings); FG-check = manual gate but with FULL FG
> inventory behind it; order-centric; whole-order dispatch (two-way); QC
> non-blocking + soft FG guard; one company-wide workflow. Nothing built yet —
> floor beta runs on v0.8.x. This is the plan we build against; §10 is the phasing.

This is the engine behind the [Modular Studio](11-modular-studio.md) — its
Layer 4 (workflow), built first because the pipeline IS the app's core logic.

---

## 1. The business flow (Level 1)

```
SALES → ORDER (multi-product, client-tagged)
  → PPC: works out requirements
  → FG STOCK CHECK: anything already in stock? ──► back to PPC
  → PPC: raise JOB(s) only for items NOT in stock
  → DESIGN: standard → forward back to PPC · new → attach drawing → PPC
  → PPC: final production requirement + Job Card (App ID + human name)
  → PRODUCTION (hero): free-scan stations, any order, live admin glance view,
                       per-station QC = "checked/issue" REMARK (non-blocking)
  → FG STOCK: serialise → notify PPC + Sales → item tagged "made for <client>"
  → SALES confirms → DISPATCH → order closed
```
Loops / branches (why this needs conditional logic, not a linear list):
- FG-check finds stock → reserve & skip production for those line-items.
- Finished, undispatched, client-tagged FG → **admin may reallocate** to an
  urgent order → triggers PPC to remake.
- Cancelled / on-hold order → PPC parks it for future.

## 2. Changes from pipeline-v2 (v0.8) — [CONFIRM each]

| # | v0.8 today | New target |
|---|---|---|
| C1 | QC is a gate stage (pass/fail/rework before FG) | **QC dissolves into Production** — a per-station "checked/issue" remark, **never blocks** movement. (Soft guard proposed: FG can't serialise with an open QC issue.) |
| C2 | Job-first (Sale Sheet → 1 Job) | **Order-first**: Sales Order (many products) → PPC → sub-Jobs only for non-stock items. |
| C3 | FG = serialise + close | **FG = reservable, client-tagged inventory**; admin can reallocate; remake loop. |
| C4 | Linear 4-gate pipeline | **Conditional, looping** business pipeline; superuser-editable logic. |
| C5 | Design = first job stage | Design sits **between PPC-requirements and PPC-final**; behaviour (forward / attach drawing) already built — reused. |

## 3. Core architecture

**Metadata-driven hierarchical workflow engine.** Two levels:
- **Level 1 — Business stages:** a versioned, ordered+conditional graph of *typed*
  stages. Generalize today's `Department` into a `Stage` carrying a **stageType**
  (a stage need not be a department — Sales, Dispatch have no station).
- **Level 2 — Production internals:** unchanged free-scan `Station`/`StationVisit`
  engine, owned by the one stage of type `production`.

**Stage-type registry (code).** Each type = a screen + transition rules + guards.
The *types* are code; their *arrangement, config, and conditions* are data.
Initial palette (maps to the flow): `sales` · `ppc_requirements` · `fg_check` ·
`design` · `ppc_final` · `production` · `fg_stock` · `dispatch`. (QC is **not** a
type — it's a per-station action inside `production`.) New types still need a dev;
everything else is config.

**WorkflowDefinition (data, versioned).** Ordered stages + typed transitions
(next-stage, with optional condition: e.g. `fg_check → ppc_final` if fully in
stock, else `→ design`). Draft → publish → version → rollback. A Job/Order
**snapshots** the published version at creation; in-flight work never changes when
a new version publishes. (We already snapshot `JobStep` — extend it.)

## 4. Data-model evolution (additive where possible)

- **Order** (new): client, items[], status (aggregate), createdBy. Parent of Jobs.
- **Job**: gains `orderId`, keeps `displayLabel` (App ID) + `name` (human). Uses
  `parentJobId` hook for sub-jobs if needed.
- **Stage** (generalize `Department`): `code, name, type, sortOrder` + per-type config.
- **JobStage** (generalize `JobStep`): `stageType`, `status`, snapshot of config.
- **StageTransition**: `fromStageId, toStageId, condition?` (the editable logic).
- **WorkflowDefinition / WorkflowVersion**: the published graph; jobs FK the version.
- **FG inventory** (new subsystem, own phase): `StockItem` (product+model, on-hand,
  reserved, available, clientTag), `StockMovement` (in/out/reserve/release, actor).
- **Per-station QC**: extend `StationVisit` with `qcChecked` / `qcIssue` / `qcNote`.
- **Dispatch** (new): packing/loading/shipment records, closes the order.

## 5. Two statuses (fall out naturally)

- **Business status** = which Level-1 stage the job/order is at.
- **Production status** = which stations are open (derive from StationVisits).
No new state machine — naming what's already implicit.

## 6. Editor — three widening rings, all behind safety rails

1. **Ring 1 — arrange:** reorder / add / remove / toggle typed stages; set
   who-acts + SLA per stage. (Covers ~80% of "process changed".)
2. **Ring 2 — conditions:** author the branch conditions on transitions
   (in-stock?, new-item?, priority?). This is where THIS flow's loops live.
3. **Ring 3 — full authoring:** custom guards, custom stage config, custom rules
   (the full Layer-4 interpreter).

**Safety rails (all rings):** draft → preview-as-role → publish; version history +
one-tap rollback; change audit (who/what/when/diff); **in-flight policy** —
running jobs finish on their snapshot, never silently re-routed.

## 7. MES risk register

- **R1 QC-as-remark removes enforcement** → add the soft FG-serialise guard.
- **R2 Reservable FG = inventory correctness** → on-hand/reserved/available + audit,
  or double-allocation. Own phase, do not rush.
- **R3 Order rollup over mixed sub-jobs** → define order-complete = all sub-jobs
  serialised, independent of path; partial states explicit.
- **R4 Editable logic on a live floor** → rings + draft/publish/rollback are
  non-negotiable before Ring 2 ships.
- **R5 Snapshot vs latest** → the single correctness property; test it first.
- **R6 Scope creep to "generic builder"** → every stage type stays bound to OUR
  entities; the palette is curated, not open.

## 8. Resolved decisions (2026-06-12)

- **Q1 → YES.** QC is non-blocking (per-station remark) **and** the soft guard
  stands: FG cannot serialise a job with an open QC issue.
- **Q2 → granularity confirmed.** Design + Production act **per job**; FG-check +
  Dispatch act **per order**. **Dispatch is whole-order only** — never partial; the
  order ships once *all* its sub-jobs are in FG stock.
- **Q3 → FULL inventory.** Build real on-hand / reserved / available math. Plus:
  **FG home screen gets an "add stocking details" action** so FG staff enter /
  adjust opening + existing stock manually.
- **Q4 → Dispatch is two-way.** (a) Sales requests dispatch → **admin approves** →
  dispatch executes; **and** (b) FG can **auto-generate a dispatch request** once
  the whole order is in stock. Both directions feed the same dispatch queue.
- **Q5 → one company-wide workflow.** Single business workflow for the whole
  factory (per-product variation lives only in Level-2 station choice, not Level-1).

## 9. The product thesis (what GRYNX *is*)

**Factory-floor management software.** Sales input → managed floor → dispatch
output, with the **admin as air-traffic-control**:
- **Glance health view** of the whole floor + what's happening now (live — built).
- **One-click "ask for an update"** from *any* station or *all* stations at once
  (generalize today's per-job request-update to per-station / broadcast).
- **Morning agenda** (start of day): what's urgent, what's due, what to do today.
- **Evening auto-summary** (end of day): the day's activity, updates, exceptions.
  *(Rule-based first; AI-generated later via the local Ollama "Ask GRYNX" path —
  see [[project_grynx_ask_grynx_plan]].)*

This daily rhythm is a first-class layer, not a nice-to-have — it's the reason an
owner opens the app twice a day.

## 10. Build order (each phase keeps the floor running)

1. **Engine core** — Stage/JobStage generalization + WorkflowDefinition/Version +
   snapshot; seed THIS flow as the published default (behaviours still coded per
   type). Floor runs unchanged on the new foundation. **Prove R5 (snapshot) here.**
2. **Flow map (read-only)** — auto-drawn graph of the seeded workflow on the admin
   PC. High-visibility, low-risk; makes the engine legible before we edit it.
3. **Order layer** — Order(client, items) → sub-Jobs for non-stock items; order
   status rollup; whole-order completion = all sub-jobs serialised.
4. **QC-into-production** — per-station QC remark on StationVisit; retire the
   standalone QC stage; FG-serialise soft guard.
5. **FG inventory (full)** — StockItem (on-hand/reserved/available, client tag) +
   StockMovement audit; FG "add stocking details"; FG-check reads availability,
   reserves & skips; admin reallocation loop → PPC remake.
6. **Dispatch** — whole-order dispatch queue, two-way (sales-request+admin-approve
   / FG-auto-request); packing/loading/ship; close order; decrement stock.
7. **Admin daily rhythm** — broadcast/station ask-updates; morning agenda + evening
   auto-summary (rule-based; AI later).
8. **Editor Ring 1 (arrange)** behind draft → publish → rollback.
9. **Editor Ring 2 (conditions)** — the FG-check / design loops become user-editable.
10. **Editor Ring 3 (full authoring)** — last.

Realistic sizing: this is **months of sessions**, not one. Phases 1–4 re-found the
core; 5–6 add the inventory/dispatch bookends; 7 is the owner's daily layer; 8–10
are the no-code editor. Each phase ships independently usable.
