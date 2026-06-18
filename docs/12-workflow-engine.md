# 12 — Hierarchical Workflow Engine (metadata-driven)

> **Status: DRAFT for confirmation.** Captures Vivek's 2026-06-12 flow + the four
> decisions (free-scan production; full logic editor as the destination; FG-check
> = manual gate first; order-centric). Nothing here is built yet — floor beta runs
> on v0.8.x. This doc is the plan we build against. Anything marked **[CONFIRM]**
> is my interpretation and may be wrong.

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

## 8. Build order (each phase ships a working floor)

1. **Engine core:** Stage/JobStage generalization + WorkflowDefinition/Version +
   snapshot + seed THIS flow as the default (hardcoded behaviours, data-driven
   arrangement). Floor runs unchanged but on the new engine. *(Prove R5 here.)*
2. **Order layer:** Order → sub-jobs; PPC raises jobs for non-stock items;
   order status rollup.
3. **QC-into-production:** per-station QC remark + the FG-serialise soft guard;
   retire the standalone QC stage.
4. **FG inventory + reservation + Dispatch:** the stock subsystem + reallocation
   loop + dispatch stage/close.
5. **Editor Ring 1** (arrange) behind draft/publish.
6. **Editor Ring 2** (conditions) — makes the loops user-editable.
7. **Flow map (read-only)** can land any time after phase 1 — high-visibility,
   low-risk; arguably do it right after the engine to make the system legible.
8. **Editor Ring 3** last.

## 9. Open questions

- Q1 Confirm C1 (QC non-blocking) + the soft FG guard.
- Q2 Order vs Job: does Design/Production act per-job (yes, "job card per job")
  while FG-check/dispatch act per-order? [CONFIRM the granularity per stage.]
- Q3 FG reservation depth: just a client tag + manual admin pull (light), or full
  reserved/available math from day one? (I lean light first.)
- Q4 Does Dispatch need its own role/screen, or is it Sales + a stores action?
- Q5 One global business workflow, or per-product/per-job-class workflows?
  (We have per-product templates already — could go either way.)
