# GRYNX — System Architecture (V1)

## 1. Guiding principles
1. **Simplicity first.** V1 ships the production workflow only. Future modules plug in without touching it.
2. **Cloud source of truth, offline-tolerant client.** Reads cached; a small set of actions queue and sync.
3. **One core, many shells.** Business logic, types, and API client are platform-agnostic.
4. **Everything is auditable.** No hard deletes; every state change is timestamped with an actor.
5. **Factory-floor usable.** Big touch targets, PIN login, minimal taps to accept/complete/hold.

## 2. High-level shape

```
        ┌──────────────────────────────────────────────┐
        │                 CLIENT SHELLS                  │
        │  PWA (pilot) · React Native (iOS/Android)      │
        │  · Tauri (Windows)  — all share the core       │
        │                                                │
        │  @grynx/core  (TS): types · API client ·       │
        │  validation (zod) · permission checks ·        │
        │  offline queue · barcode/QR utils              │
        └───────────────┬────────────────────────────────┘
                        │ HTTPS / JSON (REST) + WebSocket (live)
        ┌───────────────▼────────────────────────────────┐
        │                 API LAYER                       │
        │  Node + TypeScript (Fastify/NestJS)             │
        │  Auth · RBAC middleware · workflow engine ·     │
        │  job-ID generator · PDF/label generator ·       │
        │  notification dispatcher · SLA/escalation jobs  │
        └───────────────┬────────────────────────────────┘
          ┌─────────────┼───────────────┬─────────────┐
          ▼             ▼               ▼             ▼
   PostgreSQL      Object store     Redis         Push providers
   (source of      (images/PDF/     (queues,      Web Push →
    truth)          video, S3-like)  cache,        FCM/APNs
                                     pub/sub)
```

## 3. Component responsibilities

### 3.1 Shared core (`@grynx/core`)
- TypeScript types generated from the DB/API schema (single source).
- Typed API client used by every shell.
- Zod validators shared client+server (no drift).
- Permission helper (`can(user, action, resource)`) so the UI hides what the API forbids.
- Offline queue: optimistic local cache (IndexedDB on web, SQLite on native) + outbound action queue with idempotency keys.

### 3.2 API layer
- **Auth:** PIN (floor) and password (office) → short-lived JWT + refresh. Device-bound refresh tokens.
- **RBAC middleware:** enforces the permissions matrix (doc 04) on every route. Client checks are convenience; server is authority.
- **Workflow engine:** the only thing allowed to advance `job_steps`. Encapsulates accept → in-progress → hold/resume → complete → next department.
- **Job-ID + label service:** allocates the opaque internal ID and the daily sequence; renders the human label.
- **Document service:** generates the Job Sheet PDF (Code-128 barcode + QR) on creation.
- **Notification dispatcher:** fans out events to the right recipients (heads + backups), provider-agnostic.
- **Scheduler:** periodic SLA/escalation + long-hold checks (doc 06 §7).

### 3.3 Data
- **PostgreSQL** — relational integrity, transactions, the audit trail. (Schema = doc 02.)
- **Object store (S3-compatible)** — images, PDFs, video; DB stores only metadata + keys.
- **Redis** — job queues, caching, WebSocket pub/sub.

## 4. Offline-tolerant behavior (D3 — precise scope)
| Capability | Online | Brief offline |
|------------|--------|---------------|
| View jobs/timeline/dashboard | live | from cache |
| Accept / Complete / Hold / add Note/Image | immediate | **queued**, optimistic UI, syncs on reconnect (idempotency-key dedup) |
| Create job / approve PPC / close job | immediate | **blocked** (needs server-authoritative ID + approval) — clear "reconnect to submit" |
This is *graceful degradation*, not a full offline DB. Conflicts are avoided because queued actions are append-only events on an already-server-owned job.

## 5. Notification architecture
Event → dispatcher resolves recipients via department head/backup assignments and escalation rules → writes a `notifications` row (in-app, always) → pushes to subscribed devices.
- Pilot: Web Push (VAPID).
- Native: FCM (Android) + APNs (iOS) — the dispatcher targets a `device_tokens` table; adding a provider = adding a transport, no business-logic change.
- Recipients in V1: **department heads + backups** (+ Admin on escalation). Per D5.

## 6. Security
- TLS everywhere; secrets in env/secret manager.
- PIN hashed (argon2) like passwords; PIN allowed only on registered floor devices, rate-limited + lockout.
- RBAC enforced server-side on every request.
- All mutations write `audit_log` (actor, before/after, timestamp).
- Image/PDF URLs are signed, short-lived.

## 7. Why this scales to future modules
Sales/Store/Inventory/Vendor/Customer/Serial each become a new schema namespace + routes that *reference* `jobs`, `products`, `models` by FK. The production workflow tables never change shape — serial traceability hooks (doc 02 §13) are already reserved.
