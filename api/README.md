# GRYNX API

Backend for GRYNX — **Fastify + Prisma (PostgreSQL)**. Deliberately a **single
write authority** for the job state machine + scan engine (see `docs/10`).

## Stack
TypeScript · Fastify · Prisma · Zod · `@fastify/jwt` (JWT+refresh) · argon2 (PIN/password hashing).

## Local setup
```bash
cd api
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npm install
npm run prisma:generate
npm run migrate:dev           # creates the schema in Postgres
npm run seed                  # departments, products, admin user (to be added)
npm run dev                   # http://localhost:4000/health
```
Needs a Postgres 15+ reachable at `DATABASE_URL` (local Docker or the cloud VM).

## Deploy (pilot — single cloud VM)
1. Provision a small VM (2 vCPU / 4GB is plenty for a pilot) + Postgres (same box or managed).
2. `git pull` → `npm ci` → `npm run build` → `npm run migrate:deploy`.
3. Run under a process manager (systemd / pm2). Put **nginx + TLS** in front
   (Let's Encrypt) — required before any "SECURE/encrypted" claim in the UI is honest.
4. Point the PWA's API base URL at `https://api.<your-domain>`.

## Build order (matches docs/09 §6 and docs/10)
- [x] Data model (`prisma/schema.prisma`) — the crown jewel; everything builds on it
- [x] Seed (11 departments, AT + models, default pipeline, users PIN 123456, hold reasons, SLA settings)
- [x] Auth: PIN/password → JWT + refresh; argon2; constant-time verify + brute-force throttle
- [x] RBAC guard (`requireRole`) + audit-log hook on every mutation
- [x] Job creation: opaque id + daily sequence, pipeline snapshot → job_steps, first-dept notify
- [x] **Scan engine** (`/scan`): transactional state machine — idempotency key + optimistic
      lock, arrival-scan advance, out-of-seq/force, preview, job-status transitions
- [ ] Job-card PDF/printable (barcode/QR encoding the opaque jobNo) — *needed for floor scanning*
- [ ] QC result (approve→FG / rework→linked job) + FG closure (request→admin approve)
- [ ] Department queue read views + notes/images (signed-URL uploads)
- [ ] Notifications surfacing (read/ack) + escalation timer (unaccepted→backup→admin) + WebSocket
- [ ] Wire the React PWA to this API (replace mock data; login→token→live job/scan)
- [ ] Insights persistence (`suggestions` table) wired to `src/lib/insights.ts`

> Pilot gate (owner starts floor testing): auth + admin job-create + job card +
> department scan-to-advance + audit + exception alerts working end-to-end.
> **Status:** the scan-to-advance core (auth → create → scan → audit → out-of-seq)
> is live and tested against the DB (`scripts/smoke.mjs`, `scripts/scan-smoke.mjs`,
> 35 assertions). Remaining for the gate: **job card** (so there's a barcode to
> scan) + **wiring the PWA** to the API.

## Hard rules (do not violate)
- **One write authority.** Offline scans queue on the client and replay here; never
  add a second master (see `docs/10` §4, §9).
- **Every mutation writes `audit_log`** (actor, before, after). Soft-status only; no hard deletes.
- **The scan engine is the only writer of `job_steps` state.**
