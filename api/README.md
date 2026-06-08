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
- [ ] Seed (departments, products/models, default pipelines, admin user, hold reasons, SLA settings)
- [ ] Auth: PIN (floor) + password (office) → JWT + refresh; argon2; device registration (station binding)
- [ ] RBAC guard (enforces `docs/04` permissions matrix) + audit-log hook on every mutation
- [ ] Job creation: opaque id + daily sequence, pipeline snapshot → job_steps, job-card PDF (barcode+QR)
- [ ] **Scan engine** (`/scan`): the transactional state machine from `docs/10`
      (idempotency key + optimistic lock, arrival-scan advance, exception/force-advance)
- [ ] Department queue + notes/images (signed-URL uploads to MinIO/S3)
- [ ] Notifications (dept heads + escalation) + WebSocket live updates
- [ ] QC / FG-closure / PPC / maintenance
- [ ] Insights persistence (`suggestions` table) wired to `src/lib/insights.ts`

> Pilot gate (owner starts floor testing): auth + admin job-create + job card +
> department scan-to-advance + audit + exception alerts working end-to-end.

## Hard rules (do not violate)
- **One write authority.** Offline scans queue on the client and replay here; never
  add a second master (see `docs/10` §4, §9).
- **Every mutation writes `audit_log`** (actor, before, after). Soft-status only; no hard deletes.
- **The scan engine is the only writer of `job_steps` state.**
