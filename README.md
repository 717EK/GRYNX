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
Visual prototype: **Login + Admin Home** across iPhone/iPad/Desktop. Architecture
docs in [docs/](docs/) await sign-off. Next screens: Admin Overview dashboard, Create Job, PPC review.

## Deploying to Vercel
1. Push this repo to GitHub.
2. In Vercel → **Import Project** → select the repo (Vite is auto-detected: build `npm run build`, output `dist/`).
3. Every push auto-redeploys; open the URL on a real iPhone/iPad to test touch + PIN.
