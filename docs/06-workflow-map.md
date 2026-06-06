# GRYNX — Workflow Map (V1)

## 1. PPC request → Job
```
PPC: draft → submit ──▶ Admin notified ("Create Job [n]")
Admin ─┬─ RC (clarification) ─▶ back to PPC (edit) ─▶ resubmit
       └─ Approve ─▶ [TX] allocate job_no + label, snapshot pipeline→job_steps,
                     generate Job Sheet PDF (barcode+QR), notify 1st dept head
```
Admin direct-create skips PPC and lands at the same job-creation TX.

## 2. Department step state machine (per job_step)
```
pending ─▶ waiting_acceptance ─(Accept)▶ in_progress ─(Complete)▶ completed ─▶ next step
                    │                          │
              (SLA timer)                  (Hold, reason)
                    │                          ▼
            escalation (§7)               on_hold ─(Resume)▶ in_progress
```
- Accept records start date/time + user. Complete records completion date/time + user, advances to next pipeline step automatically.
- Last production step completes → job enters **QC**.

## 3. QC
```
QC Inbox ─┬─ Approve ─▶ forward to FG Stock (job.status=in_fg)
          └─ Send Rework ─▶ create linked rework job (RW-…), entry=chosen dept,
                            notes mandatory; original job recorded as reworked
```

## 4. Rework job
A normal job with `job_type=rework`, `rework_entry_department_id` = first step.
Flows through the pipeline from that entry point only — no full restart. Linked to parent for traceability.

## 5. Closure
```
FG verifies qty ─▶ Request Closure ─▶ Admin reviews ─┬─ Approve ─▶ status=closed
                                                     └─ Reject ─▶ back to FG (note)
```
Only Admin closes. Closed jobs are read-only (full timeline retained).

## 6. Maintenance
```
report(open) ─▶ assign(assigned) ─▶ start(in_progress) ─▶ complete(completed)
            ─▶ requester verify(verified) ─▶ Maint head/Admin close(closed)
```
Independent of production jobs (may be triggered by a hold reason = breakdown, but tracked separately).

## 7. SLA & escalation (scheduler)
| Trigger | Action |
|---------|--------|
| Step `waiting_acceptance` past `sla_due_at` (default 24h, shorter for Urgent) | notify **backup head** |
| Still unaccepted +24h | notify **Admin** (escalation) |
| Hold open ≥24h | notify dept head |
| Hold open ≥72h | notify Admin |
| Hold open ≥7d | dashboard "long hold" flag |
All thresholds configurable in Admin settings.

## 8. Edge-case handling (from questionnaire §12)
| Case | Behavior |
|------|----------|
| Head absent | escalation chain backup → Admin (D5). |
| Admin absent | multiple Admins; any can approve/close (D7). |
| Duplicate request | soft-warn PPC/Admin if same product+models+qty within 24h; not blocked. |
| Long hold | tiered escalation above (D18). |
| Qty/priority changed after creation | label regenerated; opaque job_no unchanged; barcode stays valid (D9). |

## 9. Parallel split (V1 scope — D12)
PPC `split` creates child jobs linked by `parent_job_id`, each flowing independently,
visually grouped in the UI. **Auto-merge is deferred to V2** — V1 does not silently
recombine; it shows the group and per-child progress.
