# GRYNX

**Track. Sync. Execute.**

Production workflow & factory operations management system by **D-LYFT**.

> Pilot: React + TypeScript PWA. Future: native iOS/Android (React Native) + Windows (Tauri).
> Hosting: Cloud + offline-tolerant reads. Deploy target: **Vercel**.

## Project layout
```
GRYNX/
├── docs/         Architecture, schema, API, permissions, UI/workflow maps, roadmap
├── reference/    UI references — logos, screenshots, fonts, colors (source of truth)
├── index.html    Vercel placeholder (replaced by the real app during build)
└── README.md
```

## Status
Architecture phase. See [docs/00-decisions.md](docs/00-decisions.md) for all decisions
and the items still awaiting owner sign-off. **No product code yet** — implementation
begins after architecture approval + branding assets land in `reference/`.

## Deploying to Vercel
1. Push this repo to GitHub.
2. In Vercel, **Import Project** → select the repo.
3. Root directory: `GRYNX/` (or set this folder as repo root if you split it out).
4. Until the app is scaffolded, Vercel serves `index.html` as a static placeholder.
