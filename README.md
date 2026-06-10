# GRYNX

**Track. Sync. Execute.**

Production workflow & factory operations management system by **D-LYFT**.

> Pilot: React + TypeScript PWA. Future: native iOS/Android (React Native) + Windows (Tauri).
> Hosting: Cloud + offline-tolerant reads. Deploy target: **Vercel**.

## Stack
React 18 + TypeScript + Vite. Fonts: **Saira Condensed** (display) + **Space Mono** (mono).
Design tokens live in [src/styles.css](src/styles.css); design source of truth in
[reference/design-language.md](reference/design-language.md).

## Project layout
```
GRYNX/
├── docs/         Architecture, schema, API, permissions, UI/workflow maps, roadmap
├── reference/    UI references — logos, screenshots, design language (source of truth)
├── src/
│   ├── components/UtilityBars.tsx   top/bottom status bars
│   ├── pages/LoginPage.tsx          PIN login
│   ├── pages/AdminHome.tsx          admin launcher + stat strip
│   ├── lib/useClock.ts              live SYNC clock + uptime
│   └── styles.css                   design tokens + base
├── index.html
└── README.md
```

## Run locally
```
npm install
npm run dev      # http://localhost:5173
```
PIN screen accepts any 6 digits (no backend yet) and lands on Admin Home. The ⏻ button
top-right returns to the lock screen.

### Viewing the 3 device layouts
Open dev tools → device toolbar (Ctrl+Shift+M) and try: iPhone (~390px), iPad (~820px),
Desktop (≥1200px). The admin launcher reflows from stacked rows → a 2×2 grid on tablet/desktop.

## Status
Functional end-to-end: auth + roles, PPC requests → job creation → arrival-scan floor
flow → QC → FG → closure, maintenance tickets with escalation, offline scan queue,
admin user management, and a live control-centre dashboard. Backend on Render + Neon,
web on Vercel, Android via Capacitor.

## Changelog
### v0.3.0 — app completion pass (pre-emulation)
- **Admin user management** — create users (role + dept + starting PIN), reset PIN,
  suspend / re-activate, replace roles; approvals folded into one Users screen.
- **Supervisor gate** on force-advance — only an admin can force an out-of-sequence scan.
- **SLA / aging** — per-step overdue detection; Overdue KPI + Needs-Attention feed.
- **Live admin pages** — Admin Overview and Departments now read real `/admin/stats`
  (department load + health, recent activity, status mix, completed-today) instead of mock data.
- **Reset-to-zero** script (`api/scripts/reset-data.mjs`) — wipes transactional data,
  keeps users / products / pipelines / departments / settings for clean runs.
- Offline scan queue (localStorage, idempotent replay) shipped in the scan page.

### v0.2.0
- Visual prototype: Login + Admin Home across iPhone / iPad / Desktop.

## Deploying to Vercel
1. Push this repo to GitHub.
2. In Vercel → **Import Project** → select the repo (Vite is auto-detected: build `npm run build`, output `dist/`).
3. Every push auto-redeploys; open the URL on a real iPhone/iPad to test touch + PIN.
