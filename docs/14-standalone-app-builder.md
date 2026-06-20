# 14 · Standalone App Builder — feasibility, architecture, build process & PoC

**Status: ALIGNED — PoC plan ready, awaiting GO to build.** Supersedes
[docs/13](13-app-studio-vision.md): the builder becomes a **standalone, general-
purpose app** (UI-first → backend → working app), not a GRYNX feature. GRYNX becomes
*one app built in it* later. docs/13's shipped Data pillar inside GRYNX (v0.12.0) is
kept as a **proof the kernel works** (versioned definition → runtime).

## 0. Decisions (LOCKED · 2026-06-20)

| # | Decision | Choice |
|---|---|---|
| 1 | Runtime | **Interpreted Player** — app-definition JSON, one fixed core renders/runs every built app (Bubble model) |
| 2 | Target | **Web apps first** (responsive / installable PWA); mobile later |
| 3 | "Static" meant | **The BUILDER is a fixed/static CORE** that produces many apps — *not* static built-apps, *not* desktop |
| 4 | IoT line | **Control app only** — talks to devices via MQTT/HTTP/WS/BLE; **device firmware stays hand-coded** |
| 5 | Backend | **Built-in storage** (reuse the kernel we already built) |
| 6 | GRYNX | Stays as-is; becomes *an app built in the builder* later (not migrated now) |

> "Builder is a fixed core" + "interpreted Player" line up exactly: **one stable engine,
> infinitely many built apps.** That's the whole architecture in one sentence.

---

## 1. The pivot (what changed)

| | docs/13 (built) | docs/14 (this) |
|---|---|---|
| Where | a tab *inside* GRYNX | a **standalone app of its own** |
| Scope | factory/MES domain | **general-purpose** (ERP → smart-home control) |
| Start | Data pillar first | **UI builder first** (pages: login → final) |
| Then | logic, pages | backend + frontend, both visual |

Your words: *"an app that helps build an app… a UI builder where I make pages from
login to final, then build its backend and wire the frontend, all visually — and it
should build anything from an ERP to a smart-home switch controller."*

---

## 2. Is it even possible? (the honest answer)

**Mostly yes — with one hard line you must accept.** From how the real tools work
(Bubble, FlutterFlow, Blynk) and the documented limits of no-code:

### ✅ Very feasible — the *application layer*
A visual builder can produce the **app** (UI + logic + data + integrations) for a huge
range: ERP/CRUD, dashboards, internal tools, marketplaces, booking, content, mobile
apps, **and the control app for IoT/smart-home** (the phone/web app that switches your
lights, reads sensors, automates). This is the proven sweet spot.

### ⚠️ IoT/smart-home — buildable, but it *splits in two*
This is the key insight from how **Blynk** (the leading no-code IoT platform) works:

> The no-code builder makes the **control app** (widgets → device, real-time data,
> automations). The **device firmware** that runs *on* the ESP32/Arduino is still
> hand-written. "The only coding involved is on the device firmware side."

So a smart-home switch controller = **(a)** the app we build visually + **(b)** firmware
on the switch that talks to it over a protocol (MQTT / HTTP / WebSocket / BLE). Our
builder owns (a); (b) is hand-coded on the device. The builder *connects* to hardware;
it does not *become* the hardware.

### ❌ Genuinely out of reach (don't promise these)
- **Device firmware / embedded / OS-level code** — a visual builder does not generate
  ESP32/RTOS firmware. (This is the line above.)
- **Games** (need Unity/Unreal, real-time rendering/physics).
- **Ultra-low-latency** systems (HFT/trading), kernel/driver-level software.

> **Net:** "build any app" is true for the **app/control layer** of an enormous range —
> *including* smart-home control apps — but **not** for firmware, OS-level, or games.
> If we set that boundary honestly, the vision is real and achievable in phases.

---

## 3. How the closest tools actually work (pick our model from these)

| Tool | Model | Output | Backend | Note for us |
|---|---|---|---|---|
| **Bubble** | **interpreted runtime** — a proprietary engine runs the app from its definition | hosted web app (no export) | **built-in** DB + workflows + auth | simplest to demo; one engine runs every built app |
| **FlutterFlow** | **code generation** — visual UI → real Flutter/Dart code | exportable native app (own it) | Firebase / Supabase / APIs | native + ownable, but you must generate & deploy real code |
| **WeWeb / Webflow** | UI-first visual, bind to data | web | external (Xano/Supabase/API) | great UI builders, backend is BYO |
| **Blynk** | no-code **control-app** builder + cloud + device SDK | branded mobile app | cloud + device protocol | the IoT pattern (app visual, firmware coded) |

**Two real choices for our runtime:**
- **A · Interpreted runtime (Bubble-style):** the builder stores an *app definition*
  (JSON); a generic **player/runtime** renders & runs any app from it. One codebase
  runs all apps. Instant preview, no build step. *We already proved this kernel in
  GRYNX P1.* ← recommend for PoC + v1.
- **B · Code generation (FlutterFlow-style):** the builder emits real React/Flutter
  code you export & deploy. Native, ownable, but a heavy compiler to build and every
  change = a build. ← a *later* "Export" feature, not the foundation.

Sources:
[FlutterFlow vs Bubble (architecture)](https://www.adalo.com/posts/flutterflow-vs-bubble/) ·
[Blynk low-code IoT (app vs firmware split)](https://www.blynk.io/) ·
[No-code limits — what's out of reach](https://www.goodbarber.com/blog/limitations-of-no-code-app-builders/)

---

## 4. Proposed architecture (standalone builder)

```
   THE BUILDER (a standalone app)                THE PLAYER / RUNTIME
   ┌───────────────────────────────┐            ┌──────────────────────────┐
   │  UI builder   (pages, comps)  │            │  reads an APP DEFINITION │
   │  Data builder (entities, db)  │ ── saves ─▶│  and RENDERS + RUNS the  │
   │  Logic builder(flows, actions)│  App Def   │  built app for end-users │
   │  Connections  (REST/MQTT/WS)  │   (JSON,   │  (web first; mobile later)│
   └───────────────────────────────┘  versioned)└──────────────────────────┘
            every component / action / entity / connection = a registered NODE
```

- **One portable App-Definition** (JSON): `{ pages[], entities[], flows[], connections[], theme }`. Versioned + publishable (we built this pattern twice already: workflow + apps).
- **The Player**: a generic renderer that turns the definition into a live app —
  pages, components bound to data, buttons firing logic, connections to APIs/devices.
- **Connections layer** = how built apps reach the world: REST, **MQTT/WebSocket/BLE
  for IoT control**, external DBs. This is what makes "smart-home switch" possible.
- **Standalone**: its own repo/app + auth + storage; GRYNX is later re-built *in* it.

---

## 5. Build process (phases — each ends in something runnable)

- **P0 · Scaffold + schema:** new standalone app (React + the existing API stack), the
  App-Definition schema, and a **bare Player** that renders a hard-coded definition.
- **P1 · UI builder (your starting point):** a **page canvas** — drag components
  (text, input, button, table, image, container), multi-page (login → home → detail),
  navigation between pages, a theme. Player renders the pages. *Static/sample data only.*
- **P2 · Data/backend builder:** entities + storage + auto-CRUD (lift GRYNX P1's data
  engine). Bind components to real data (a table shows records; a form writes one).
- **P3 · Logic builder:** flows — on button click → validate → create record →
  navigate. Triggers/conditions/actions as nodes (React Flow, already in).
- **P4 · Connections:** REST + **MQTT/WebSocket** so a built app can read a sensor or
  flip a switch — the IoT/smart-home path, as a control app.
- **P5 · Publish / (later) export:** host the built app at its own URL (interpreted);
  optional code-export comes after.

---

## 6. Proof of Concept (build this FIRST to prove the whole idea)

A tiny **end-to-end vertical slice** that proves *UI → backend → working app* in a
standalone builder — small, but exercises every layer:

1. In the **builder**: make a 2-page app — a **Login page** and a **Home page**.
2. On Home, drop a **table** + an **"Add" button + input**.
3. Define one **entity** (`note { text }`) with storage.
4. Wire the button: **on click → create a `note` from the input → refresh the table**.
5. **Publish** → open the app at its own `/play/:appKey` URL: login works, you add a
   note, it persists and lists. **That's UI + data + logic + runtime, standalone.**
6. **IoT proof (stretch):** add a second button "Send" wired to **publish an MQTT/HTTP
   message** — proving the control-app path to hardware without any firmware on our side.

If that PoC works, the architecture is sound and every later phase is "more nodes."

### 6.1 Concrete PoC build plan (what I'd actually do on GO)

**Where it lives:** a **new standalone web app** at `builder/` (its own Vite + React
project, separate from GRYNX's `src/`). It has two routes:
- `/build` — the **Builder** (page canvas + component palette + entity + wiring).
- `/play/:appKey` — the **Player** (renders a published app-definition as a real app).

**Backend for the PoC:** **reuse the kernel we already shipped** — the
`App / AppVersion / AppRecord` tables + `/api/v1/apps` data engine (docs/13 P1) already
store a versioned definition + records. We only **extend the definition JSON with a
`pages[]` shape** (the schema already has the field) and add a tiny public read for the
Player. *No new backend tables.* (Later, when we fully separate, the kernel extracts
into the builder's own service — but for the PoC, reuse = fastest proof.)

**The vertical slice (one week-ish of focused work):**
1. `builder/` scaffold + the App-Definition TS types (`pages`, `components`, `entity`,
   `bindings`, `actions`).
2. Builder UI: a page list (Login, Home), a canvas, a small palette (text, input,
   button, table), a property panel. Drop components, set props, save the definition.
3. One entity (`note { text }`) via the existing data engine; bind the table to it.
4. Wire the button: `onClick → createRecord(note, input) → refresh table`.
5. The Player at `/play/:appKey`: fetch the published definition + render pages +
   run bindings/actions live. Login → Home → add note → it lists & persists.
6. Stretch: a "Send" button → `action: http/mqtt publish` → proves the IoT control path.

**Definition of done for the PoC:** in a standalone app, a non-coder builds a 2-page
app with a working data form and opens it live at its own URL — proving UI + data +
logic + runtime end-to-end. Then we decide whether to invest in the full platform.

### 6.2 What the PoC deliberately skips
No drag-resize polish, no auth-per-built-app, no theming UI, no logic node-graph yet
(buttons get a simple action dropdown), no mobile, no real device (HTTP/MQTT stub).
Those are phases P1–P5 once the PoC proves the spine.

---

## 7. Decisions to lock before P0 (open questions)

1. **Runtime model:** interpreted Player (Bubble-style, recommended for PoC/v1) vs
   code-generation/export (FlutterFlow-style, later)?
2. **Target output:** **web apps** first (simplest), or mobile/cross-platform from the
   start (much bigger)?
3. **"Static app" — what did you mean?** (a) the *builder* is a static SPA; (b) the
   *built apps* are static/client-only; (c) a standalone *desktop* app (Tauri/Electron)?
   This materially changes P0.
4. **The IoT line:** OK to accept that we build the **control app** (talks to devices
   over MQTT/HTTP/BLE) and **device firmware stays hand-coded** (the Blynk model)?
5. **Backend:** built-in storage (recommended — we have the engine) vs connect external
   (Supabase/Firebase)?
6. **GRYNX:** confirm it stays as-is and becomes *an app built in the builder* later
   (not migrated now)?

Once these are answered I'll turn this into a concrete P0/PoC technical spec, then we
build the PoC — *then* decide if the full thing is worth the (large) investment.
