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
### v0.6.1 — fit-to-viewport desktop (single page, no scroll)
- The desktop admin is now a **fixed 1440×812 reference design scaled as one unit**
  to fill any screen — identical layout on every desktop (no more per-screen
  reflow), one page, **no scroll**. Removed the viewport media queries that fought
  the scaling; fixed the header wrap/overlap. Verified at 840px and 1536px.

### v0.6.0 — mission-control desktop dashboard
- Rebuilt the desktop admin dashboard as a dense **"Factory Mission Control"** —
  GRYNX Intelligence (synthesized insights + suggested action), Production Snapshot,
  Pending Approvals, **Live Pipeline** (stage flow with auto-flagged bottleneck),
  Factory Feed, Aging Jobs, Hold Analysis, Today, Urgent, plus a persistent
  Needs-Attention / Admin-Queue / Ask-GRYNX rail + demoted calendar. Fills the space.
- `/admin/stats` extended with snapshot / pipeline / aging / hold-by-reason / urgent.

### v0.5.2 — bottom-bar responsive 5-part layout (fits phone width)

### v0.5.1 — bottom-bar exact spec + D-LYFT logo
- Statistics bar refined to spec: 780px bar / 64px tall / 16px radius, 160px stat
  blocks, 22px·700 values centred under 10px·2px labels, 42px dividers, SCAN button
  108×88 protruding 24px from the centred 140px reserve, 10px gap to the footer
  (fixed default `<button>` chrome that split the bar). Verified via headless shot.
- Desktop admin rail now shows the **D-LYFT logo** instead of the placeholder glyph.

### v0.5.0 — warm "Work OS" desktop admin + calendar
- New **desktop admin console** (`DesktopAdminWarm`) in a warm-paper bento theme
  (scoped to desktop admin only; the floor/mobile app stays dark): slim icon rail,
  greeting header, hero "Floor status" numeral, KPI tiles, throughput + department-
  load widgets, and a live **Needs-attention** feed — all wired to `/admin/stats`.
- **Calendar widget** — month grid marking **active jobs** (start date) and **closed
  jobs** (completion date); month navigation + click a day to list/open that day's
  jobs. Backed by a new `/admin/calendar` endpoint.
- Verified the layout with the headless screenshot harness before shipping.

### v0.4.6 — bottom-bar matches reference (verified via headless screenshot)
- Cell content is **centre-aligned** (labels + numbers); tightened the label type so
  "IN PROGRESS" fits without clipping; SCAN button sized to 60px in its own cell.
- Built a Playwright screenshot harness (`api/.tmp/harness.html` + `shoot.mjs`) to
  render the bar with real CSS/fonts/theme and verify visual changes before shipping.

### v0.4.5 — bottom-bar: even 5-cell layout
- Reworked the admin stats card into **five even cells** (TOTAL JOBS · IN PROGRESS ·
  SCAN · COMPLETED · ALERTS). The SCAN button now lives in its own centred cell —
  smaller, contained, protruding just slightly — so it no longer overlaps/clips
  "IN PROGRESS". Dividers between every cell; subtler glow.

### v0.4.4 — feedback image upload fix + bottom-bar polish
- **Fixed:** attaching a gallery image to a feedback report failed to send ("could
  not send" / stuck on "sending"). Cause was payload size — Fastify's 1 MB default
  body limit. Raised the API limit to 20 MB **and** the client now downscales images
  to ≤1600px / JPEG before attaching, so payloads stay small.
- Admin home stats strip is now a **bordered rounded card** with the SCAN button
  sized up as the hero poking out of the top.

### v0.4.3 — QC rework reroute
- **QC rework now actually moves the job.** The inspector picks which production
  department to send a rejected job back to; that station is re-armed, every step
  between it and QC resets, the job returns to `in_production`, and the floor
  re-scans back up to QC. (Was previously a log/notification dead-end.)

### v0.4.2 — floor-run feedback + findings
- **Admin home**: SCAN button is now the hero — stats panel slimmed and the button
  lifts above it.
- **Job Status** rows show the live station + step ("Design · Awaiting", "CNC / VMC ·
  In Progress") instead of just the coarse job status — so a freshly-approved job no
  longer misreads as "In Production" before any scan.
- **PPC notifications** for a request auto-clear once it's approved / rejected /
  sent back (admins' "review & approve" notice no longer lingers).
- **Department load** counts only the station a job is actively at (was double-
  counting the next-armed station too).
- Smaller notification rows.

### v0.4.1 — dogfooding fixes
- **Feedback form**: top-anchored (leaves room for the keyboard), no more app-zoom
  on focus, readable fields (was black-on-black); reliable screenshot via
  modern-screenshot; **add-image** and **voice-note** attachments (voice auto-
  transcribes into the remark where supported).
- **Notifications** now clear once attended — the feed is a live unread queue, and
  scanning a job auto-clears that scanner's pending notifications for it.
- **Admin home** menu badges show real live counts (pending PPC / active / overdue /
  pending users / open tickets) instead of placeholder numbers.
- Fixed the SCAN button label clipping on the admin home.

### v0.4.0 — in-app feedback / bug reporter
- **Floating draggable reporter button** on every screen — drag it anywhere, tap to
  open a bug / idea / note form with severity, a free-text remark, an optional
  one-tap **screenshot** of the underlying screen, and an auto-attached diagnostic
  log (screen, role, version, viewport, online state, recent console errors).
- Reports persist to a new `Feedback` table; admin endpoints to list / triage /
  resolve and a `/feedback/count` summary (open + critical) for quick standups.

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
