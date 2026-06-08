# GRYNX — Job State Machine, Scan Engine & Offline Sync (design, pre-code)

> The riskiest unbuilt part of GRYNX. Designed before any backend code per
> `docs/09-operating-principles.md`. Read the failure-mode section — it's the point.

## 1. Routing unit
The tracking unit is the **job** (V1). To not paint ourselves into a corner for
future splits, every scan targets a **`routing_unit`** = the job today, or a
split-child later. Job cards/barcodes encode the opaque `routing_unit_id`
(immutable), never the human label.

## 2. Job state machine
**Job lifecycle** (high level):
```
draft → pending_approval → approved → in_production → in_qc → in_fg
       → close_requested → closed
(any) → cancelled            [terminal, admin only, reason required]
```
**Step machine** (one `job_steps` row per pipeline department, snapshotted at creation):
```
pending → waiting_acceptance → in_progress → completed
                                   ↘ on_hold → in_progress (resume)
                              (skipped — pipeline edited)
```
**Transition table** (only the engine performs these; nothing else writes step state):
| Transition | Trigger | Guard | Side effects |
|---|---|---|---|
| create job | Admin / approve PPC | valid pipeline | snapshot steps; first step → waiting_acceptance; gen job card; notify 1st dept head |
| accept / start step | **arrival scan** at step's dept (or manual accept) | scanner dept == step dept; step waiting_acceptance | step → in_progress; start_at, by; event; audit |
| complete step + advance | **arrival scan at the NEXT dept** | scanner dept == next step's dept; current step in_progress | current → completed (at=scan time, by=scanner); next → in_progress; events; notify |
| hold | explicit action (scan → Hold) | step in_progress | step → on_hold; reason (+photo) required; audit; escalation timer |
| resume | explicit action | step on_hold | step → in_progress; audit |
| QC result | QC approve / rework | last prod step completed | approve → in_fg; rework → spawn linked rework job |
| closure | FG request → Admin approve | in_fg | close_requested → closed (admin only) |
| cancel | Admin | not closed | status cancelled, reason; audit; soft only |

## 3. Scan model — "arrival scan auto-completes the previous station"
A worker scans a job card **only when the job ARRIVES at their station.** That
single act means: *the previous station is done, and the job is now here.*

- **Scanning station is derived from authentication, not the scan payload.** The
  floor device/user is registered to a department; the scan carries the job id +
  the authenticated session. This prevents station spoofing.
- One scan ⇒ engine completes the prior in-progress step (timestamped at scan time,
  attributed to the scanner) and starts the scanned station's step.
- **No "out" scan.** Cycle time at a station = time between its arrival scan and the
  next station's arrival scan. The **last** station (FG receipt) is the explicit
  end; QC/FG scans complete the preceding steps.
- **Holds are NOT scans** (they need a reason/photo) — explicit action. Holds are
  low-frequency exceptions; this is an acceptable interjection.

## 4. Scan event = one transaction (concurrency-safe)
```
BEGIN
  load routing_unit + current step  (SELECT … FOR UPDATE / version check)
  validate transition (see guards)
  INSERT scan_events (… , idempotency_key UNIQUE)   -- dedup
  UPDATE prev step → completed; next step → in_progress; bump job_steps.version
  INSERT job_events (+ audit_log)
COMMIT
→ emit WS event (job.step.changed) + notifications
```
- **Idempotency:** `scan_events.idempotency_key` (client-generated UUID per physical
  scan) is UNIQUE. A retried/duplicate scan hits the unique constraint → returns the
  prior result, applies nothing.
- **Optimistic lock:** `job_steps.version`. Two near-simultaneous scans: one commits
  and bumps version; the other's version check fails → re-read → it's a no-op
  (already advanced) or a clean rejection. **Single authoritative DB — no
  multi-master.** Offline queues replay into this one authority.

## 5. Offline scan sync
Floor wifi dies. The scanner must keep working.
- Scan is captured locally (IndexedDB) with `{routing_unit_id, client_ts,
  idempotency_key}` and an optimistic local UI update ("job moved to your station").
- On reconnect, queued scans POST to the server **in client_ts order**.
- Server applies via the same transaction. Because keys are idempotent and the
  state machine validates against *current* server state, a **stale** queued scan
  (a later scan already advanced the job) is recorded as a historical scan_event
  with `result = superseded` — not re-applied. No corruption, full audit.
- This is *graceful degradation*, matching decision D3 — not a full offline DB.

## 6. Failure modes (the part that matters)
| Failure | Handling |
|---|---|
| **Out-of-sequence scan** (station not the expected next) | Reject by default with a clear message ("job is at CNC/VMC; you scanned at Powder Coat"). Supervisor **override with reason** allowed (audited) for genuine re-routing. |
| **Double scan / two devices at once** | Idempotency key + optimistic lock → exactly one applies; others are no-ops. |
| **Missed scan** (job moved, never scanned) | Job looks stuck. **Exception detection**: step in_progress past its size-scaled SLA → alert (insights engine). Supervisor **force-advance** (audited) to recover. |
| **Wrong job scanned** | Scanner screen shows a 1-tap **confirm** ("AT-U-045 → now at CNC/VMC. Confirm?") + audited **undo** window (e.g. 10 min, supervisor). 1 tap is acceptable interjection vs the cost of a wrong advance. |
| **Hold needs reason/photo** | Explicit Hold action, not a scan. |
| **Rework** | QC "send rework" spawns a **new linked job** with its own card + entry station; it flows by scan from there. Parent flagged `reworked`. |
| **Parallel split** (V2) | Cards carry child `routing_unit_id`; scans target the child. Merge gate (all children completed) deferred — but the scan key already supports it, so no rewrite. |
| **Lost/edited pipeline mid-job** | Steps are snapshotted at creation; editing the template only affects future jobs (decision: "save for future"). In-flight jobs keep their snapshot. |

## 7. Exception detection is mandatory (not optional)
Scan-first **concentrates** risk on one event. The safety net is detecting the
*absence* of expected scans: any step in_progress beyond `stationSlaHours(qty)`
(see `src/lib/insights.ts`) raises a suggestion/alert. Without this, a missed scan
reproduces the classic MES data-quality failure. This must ship **with** the scan
engine, not later.

## 8. Data-model additions
- `routing_units` (V1: 1:1 with jobs; V2: job + splits) — or keep `jobs.id` as the
  routing unit now and introduce the table only when splits land. **Decision: keep
  `job_id` as the routing key in `scan_events` now; rename to routing_unit at split
  time (non-breaking via a view).**
- `scan_events`: id, job_id (fk), station_dept_id (fk), scanned_by (fk users),
  client_ts, server_ts, idempotency_key (unique), result enum(applied, duplicate,
  rejected_out_of_seq, forced, superseded), note null.
- `job_steps`: add `version int default 0` (optimistic lock).
- `device_tokens`: already has `is_floor_device` + department → the auth-derived
  station.

## 9. What would worry an experienced MES architect about this design?
- **The single-scan-completes-previous model trades completeness for adoption.** Its
  Achilles heel is the *missed* scan — the job silently stays at the old station.
  Mitigation is exception detection + force-advance, but that only works if SLAs are
  tuned realistically; too tight → alert fatigue → ignored; too loose → late
  detection. **This needs real-floor tuning during the pilot; it cannot be
  finalized on paper.** (confidence: medium until piloted.)
- **Cycle-time accuracy is approximate** — a station's completion time is inferred
  from the *next* station's arrival scan, not the actual hand-down. Fine for flow
  visibility; **not** good enough if you ever bill or cost by exact per-station
  minutes. Be explicit that these are flow timestamps, not labor-cost timestamps.
- **"Station from auth" assumes one device ≈ one department.** Shared scanners that
  roam between stations break this. Pilot rule: a floor device is bound to one
  department; if hardware roams, station must be selected explicitly (more
  interjection) — decide per real layout.
- **Out-of-sequence override is a back door.** Convenient for re-routing, but every
  override is a hole in traceability. Keep it supervisor-only, reason-required,
  loudly audited, and **report on override frequency** — a rising rate means the
  pipeline model is wrong.
- **Concurrency is only safe with a single write authority.** The moment you add a
  true on-site server *and* a cloud server both accepting scans, you have
  multi-master and this design breaks. Keep one authority; offline is queue-and-
  replay, never a second master.
- **Barcodes are forgeable/edge-damaged.** A torn/smudged card, a photocopied card,
  or a reprinted card for a cancelled job can mis-scan. Need: QR+barcode redundancy,
  reject scans for closed/cancelled jobs, and a "card reprint" audit trail.
- **Adoption still isn't free.** "Just scan on arrival" is one action, but if it's
  not physically convenient (scanner not at the station entry, card not on the
  part), workers skip it. The win or loss is **physical process design**, not code —
  the owner's domain. Flag this explicitly to the owner before the pilot.

## 10. Pilot success criteria (scan engine)
Jobs advance correctly by scan across all departments; missed/double/out-of-order
scans are detected or safely rejected; offline scans reconcile without corruption;
every advance is audited; override rate is visibly low. Tune SLAs from real data.
