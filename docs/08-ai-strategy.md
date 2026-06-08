# GRYNX — AI Strategy & "Factory Intelligence" (V1 → V3)

> Principle: **AI is an Assistant, not a Manager.** It reads state and produces
> *suggestions + summaries*. It never approves / creates / assigns / modifies /
> closes jobs. Every decision stays human. Automate the **nudging and reporting**,
> not the decisions.

## Phases
| Phase | What | Where it runs |
|---|---|---|
| **1 — Rule-based (now)** | Daily/weekly summary, follow-up suggestions, bottleneck + hold-escalation detection. **No LLM, no cost.** | In-app (`src/lib/insights.ts`), surfaced on the **Intelligence** screen + suggestion chips |
| **2 — LLM assist** | Natural-language summaries, Q&A over the DB ("which jobs are at risk this week?"), drafting update-request messages | A separate **read-only** insights service (local model and/or Claude) |
| **3 — Advanced analytics** | Delay / capacity / trend analysis over history | Same read-only service, more data |

## The guardrail (architectural, not a promise)
- Insights run as a **read-only** service; the only table it writes is `suggestions`.
- The UI renders suggestions as **dismissible chips with a human action button**. Nothing takes effect until a person taps it.
- Accepted suggestions are logged in `audit_log` with `actor = the human`, `source = "ai-suggested"`. Full traceability.

## `InsightsProvider` interface (swap rules → LLM without touching UI)
`summarize(state) → DailySummary` and `suggestions(state) → Suggestion[]`.
Phase-1 `RuleBasedInsights` implements it today; a Phase-2 `LlmInsights` (local or
Claude) implements the same shape later. The UI only knows the interface.

## Auto update-call rule (confirmed)
"Nudge if a job sits at a station longer than a couple of hours — **scaled by job size**."
```
stationSlaHours(qty) = clamp(2 + floor(qty/25) * 1, max 10)   // bigger jobs get more grace
if hoursAtStation > stationSlaHours(qty) → suggest "Send update request"
```
Default human-in-loop. Optional **autonomy dial** (per action type) can let the
system auto-send the *routine* update-request after the SLA — decisions
(approve/close/assign) stay permanently human.

## New table (reserved; non-breaking)
### suggestions
| col | type | notes |
|-----|------|-------|
| id | uuid pk | |
| kind | enum(update_request, escalation, bottleneck, hold_review, approval) | |
| severity | enum(info, warn, alert) | |
| title / detail | text | |
| job_id | fk jobs null | |
| ticket_id | fk maintenance_tickets null | |
| action | text | the proposed human action |
| source | enum(rule, llm) | which provider produced it |
| status | enum(open, accepted, dismissed) | |
| acted_by | fk users null | set when a human taps the action |
| created_at | timestamptz | |
FKs into existing tables → adding this does not change the V1 workflow schema.

## Model recommendation (2026)

**Local (privacy-first, Mac Mini M4 / later RTX 5090)** — via Ollama or MLX:
| Hardware | Pick | Why |
|---|---|---|
| Mac Mini M4 (24–32GB) | **Qwen3-32B** (4-bit, ~20GB) for analysis; **Llama 3.1 8B / Qwen2.5-7B** for fast digests | 32B fits 32GB unified memory; small model handles routine summaries cheaply |
| RTX 5090 (32GB GDDR7) | **Qwen3-32B fully in VRAM** (fast Q&A); 70B-class with partial offload when needed | Much faster tokens/sec than the Mac; good for interactive Q&A |

**Cloud (best reasoning + data controls)** — recommend **Claude**, tiered:
| Use | Model | Price (per 1M in/out) |
|---|---|---|
| Routine daily summaries (high volume) | **Claude Haiku 4.5** (`claude-haiku-4-5`) | $1 / $5 |
| Weekly analysis, Q&A, drafting | **Claude Sonnet 4.6** (`claude-sonnet-4-6`) | $3 / $15 |
| Hard "explain/recommend" cases | **Claude Opus 4.8** (`claude-opus-4-8`) | $5 / $25 |

Cost controls (big levers): **prompt caching** (cache the schema/instructions prefix → cache reads ~0.1× input; writes 1.25×) and the **Batch API** (−50%) for non-urgent nightly/weekly digests. Use the **cheap model for arithmetic-free summaries, the smart model only for reasoning** — never pay an LLM to count active jobs (rules do that for free).

**Design it pluggable:** one `InsightsProvider` boundary; start local for the pilot, switch to Claude (or run both — local for routine, Claude for the hard queries) without touching the app. Other providers (GPT, Gemini, Grok) drop into the same interface if ever needed; Claude is the recommendation for structured analysis + read-only tool scoping + enterprise data handling.
