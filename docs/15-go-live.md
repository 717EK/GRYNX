# 15 · GRYNX go-live runbook

Deployment-readiness audit (2026-06-20, at v0.12.0) + the actions to do before the
real go-live. Auto-deploy: push `main` → Render (API) + Vercel (web) redeploy.

## ✅ Verified green (technical readiness)

| Check | Result |
|---|---|
| DB migrations | **Up to date** on Neon — no drift, none pending |
| JWT secret | **Secure** in prod — a forged token signed with the dev default was **rejected (401)** on live |
| WebAuthn (biometric) | Bound to the real domain — live `rp.id = grynx-gamma.vercel.app` (Face-ID/fingerprint works) |
| CORS | Working — the live web app talks to the API |
| PWA updates | `registerType: 'prompt'` **+ polls every 60s** → users get an "Update available" prompt within a minute of each deploy |
| Build / typecheck | Frontend build + API typecheck **clean** |
| Live versions | Render + Vercel both on **v0.12.0** |
| `.env.example` | Present (root + api) — required env documented |

## 🔴 DO before go-live (owner actions)

1. **Change the admin & developer PINs — TOP PRIORITY.** All 18 users (including
   **`aashish`** = owner and **`admin`** = SuperUser/developer) are still on the default
   PIN **`123456`**, and usernames are guessable. Anyone could sign in as the owner or
   the developer (who has Workflow Studio + App Studio access).
   - **Easiest:** sign in as `aashish` → User Manager → **Reset PIN** for `aashish`,
     `admin`, and ideally every staff member to a value they set.
   - **Or run once** (set your own values) against the API as an admin:
     `POST /api/v1/users/:id/reset-pin  { "pin": "<new 6-digit>" }`.
   - At minimum, change `aashish` and `admin` before the floor logs in.

2. **Decide on the beta/test data.** The DB still holds floor-beta sample jobs/orders
   (e.g. `AT-U-026…`) and a tiny App-Studio demo (`grynx` app → `supplier` → 1 record,
   SuperUser-only). For a clean production start, decide: **keep** the beta data, or
   **reset to a clean slate** (we can script an exact-ID wipe of test jobs/orders —
   never a wildcard delete). Say the word and I'll prepare it.

## 🟡 Optional / later

- **Custom domain** (e.g. `app.dlyft.in`): add it in Vercel, point DNS, then update on
  Render — `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN`, `CORS_ORIGINS` — to the new domain,
  else biometric + CORS break on it. (Current `grynx-gamma.vercel.app` works as-is.)
- **Android APK**: web/PWA is the primary surface; the APK (v0.12.0 / versionCode 44)
  is a separate build if you distribute the native app.

## Verify a deploy is live
- API: `GET https://grynx-api.onrender.com/api/v1/<a route>` → `401` = new build up,
  `404` = still old build (for newly-added routes).
- Web: the footer shows `GRYNX vX.Y.Z`; or grep the served JS bundle for the version.

## Roll back a bad deploy
- Code: `git revert <sha> && git push` → auto-redeploys the previous good state.
- Or instant: **Vercel** → Deployments → Redeploy a previous build; **Render** →
  Manual Deploy → pick the prior commit.
- Workflow/app schemas are versioned — **roll back in the Studio** (re-publish the
  prior version) without any code change.
