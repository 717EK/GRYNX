# 13 · App Studio — vision & discussion sheet

**Status: DISCUSSION (no code yet).** This sheet is to get aligned on what we are
actually building before we write anything. Read it, mark it up, answer the
questions at the end.

---

## 1. What you said (so I make sure I understood)

> "The Workflow Studio is basically an app in itself. I can build a GRYNX-type app
> and its fully working model inside it. The core stays the same; all the logic and
> pages we make and connect; we also program how data is stored and where; and every
> feature becomes a selectable node."

In plain terms: you don't want a *pipeline editor*. You want a **visual platform to
build whole working apps** — GRYNX being the first app built *in* it. A factory (or
you, for a client) assembles their app from nodes: data, logic, pages, integrations.
A fixed **runtime ("the core")** then runs whatever you assembled.

This is a real, well-known category. The industry name is a **metadata-driven
low-code / no-code application platform**.

---

## 2. What this is, in industry terms

Every platform in this space (Retool, Appsmith, Budibase, ToolJet, n8n, Node-RED,
Bubble, Mendix/OutSystems) is built on the **same core pattern**:

> **The app is not code. The app is DATA (a definition / "metadata"), and a single
> fixed runtime engine interprets that data to render UI, run logic, and store
> records.** One engine, infinitely many apps.

That is *exactly* what GRYNX's workflow engine already does in miniature:
a versioned `WorkflowDefinition` (metadata) → a job **snapshots** it → the runtime
interprets the snapshot. We just need to generalise "workflow" to "the whole app".

### The canonical architecture (what all of them share)

```
┌──────────────────────────────────────────────────────────────┐
│  STUDIO (design time)          │   RUNTIME (run time)         │
│  — what the builder uses —      │   — what end-users use —     │
├─────────────────────────────────┼──────────────────────────────┤
│  Data modeller   ─┐             │             ┌─ UI renderer   │
│  Logic / flow ed. ─┤→ APP DEF ──┼── reads ───→┤  (pages)       │
│  Page builder    ─┘  (metadata, │             ├─ Logic engine  │
│  Connector setup     versioned  │             │  (flows)       │
│                       JSON)     │             └─ Data engine   │
│                                 │                (storage)     │
└─────────────────────────────────┴──────────────────────────────┘
        Component / node REGISTRY  (the "selectable nodes")
```

- **App definition (metadata):** the whole app as versioned JSON — data models,
  pages, logic flows, bindings, permissions. (GRYNX already versions workflow JSON.)
- **Runtime ("the core"):** one engine that reads the definition and *is* the app.
  Two flavours: **interpret** the metadata live (instant changes, what we'd do) or
  **generate/compile** code (what GRYNX does today for jobs). Modern platforms
  interpret.
- **Registry of nodes/components:** every "feature" (a table, a button, an API call,
  an if-condition, a scan action) is a registered, selectable building block.

### The three pillars (every app = these three)

| Pillar | What it is | Best-in-class example | Editor shape |
|---|---|---|---|
| **Data** | entities, fields, relations, **where it's stored** | Budibase internal DB; Airtable | a **schema/table modeller** |
| **Logic** | triggers → conditions → actions, automations, queries | n8n, Node-RED | a **node-graph (flow)** ← we have this |
| **UI** | pages, components, bound to data + logic | Retool, Appsmith | a **component canvas / tree** |

Important nuance from the research: **"everything is a node" is the right mental
model, but in practice the three pillars use different editor shapes.** Logic is a
true node-graph (Node-RED/n8n). Data is a schema/table modeller. UI is a
drag-on-canvas component tree (Retool/Budibase) — *not* a wire graph, because pages
are hierarchies, not message flows. They all compile to the **same app-definition
metadata**, so it still feels like "one system of selectable blocks."

---

## 3. The landscape — what to steal from whom

| Platform | OSS? | Strength to borrow | Stack |
|---|---|---|---|
| **Budibase** | ✅ | internal DB + data-first app builder + automations; clean self-host | Svelte / Node / CouchDB |
| **ToolJet** | ✅ | 60+ components, JS/Python logic, 75+ connectors | React / Node / Postgres |
| **Appsmith** | ✅ | JS-everywhere binding model, mature widget set | React / Java / Mongo |
| **Retool** | ❌ | the gold standard UX for the page builder + query binding | closed |
| **n8n** | ✅ | the logic/flow node engine + 400 integrations + AI nodes | React / Node |
| **Node-RED** | ✅ | the *purest* flow runtime: flows = JSON, msgs between nodes, custom-node SDK | Node.js |

**Closest blueprint for us:** a **Budibase-style data-first builder** (because a
factory app is data-heavy) **+ an n8n/Node-RED-style flow engine for logic** (which
we already started with React Flow) **+ a Retool-style page binder for UI** — all
emitting one versioned app-definition that our runtime interprets. The good news:
GRYNX's Fastify + Prisma + Neon + React stack can host all of this natively.

Sources:
[Budibase vs Retool vs Appsmith](https://blog.tooljet.com/appsmith-vs-budibase-vs-tooljet/) ·
[n8n vs Node-RED](https://n8n.io/vs/node-red/) ·
[Node-RED (flow runtime)](https://en.wikipedia.org/wiki/Node-RED) ·
[Metadata-driven application architecture](https://www.claysys.com/blog/metadata-driven-application-development/) ·
[Model-driven dev = foundation of low-code (Mendix)](https://www.mendix.com/blog/low-code-principle-1-model-driven-development/)

---

## 4. How this maps onto GRYNX (the unlock)

GRYNX is currently **hand-coded**. The vision flips it: GRYNX becomes **the first app
expressed as metadata in the Studio**, run by a generic runtime. We already have:

- ✅ a **versioned definition + snapshot runtime** (workflow engine) — the kernel.
- ✅ a **node-graph editor** (React Flow Workflow Studio) — the logic-pillar seed.
- ✅ a **data layer** (Prisma/Neon) + **auth/roles** + the **warm UI system**.
- ✅ a **SuperUser/developer vs Admin/owner** split — already built. The Studio is a
  *developer* tool; built apps are used by factory staff. Perfect fit.

So we are not starting from zero. We are **generalising the kernel we already have**.

---

## 5. The big forks (decisions that change everything)

Each of these is a real fork. My recommendation is marked ★ — but these are yours.

**A. Scope — how general?**
- ★ **Factory/MES-domain app builder.** Nodes & components are operations-shaped
  (orders, jobs, stations, scans, stock, QC). Build GRYNX-like apps fast. Achievable.
- *General-purpose (a Bubble competitor).* Build *any* app. 5–10× the work, and not
  your market. (Strong recommend against, at least at first.)

**B. Build vs adopt.**
- ★ **Build native on the GRYNX stack.** One stack, deep integration, owns the IP,
  reuses the kernel. More work up front, but no second platform to wrangle.
- *Fork/embed an OSS platform (Budibase/ToolJet).* Faster to a demo, but a second
  stack glued to GRYNX, and their data model fights yours. Good for *prototyping
  ideas*, risky as the foundation.

**C. Runtime model.**
- ★ **Interpret metadata at runtime** (one engine renders any app). Instant changes,
  no redeploy — the low-code promise. Bigger engine to build.
- *Generate code* (like GRYNX today). Real code output, but every change = redeploy.

**D. The editor model.**
- ★ **Three specialised surfaces over one metadata model**: Data modeller +
  Logic-flow node-graph + Page builder. Feels unified ("everything's a block") but
  each pillar uses the right shape.
- *One literal node-graph for everything* (incl. UI as nodes). Conceptually pure,
  but painful for page layout — no serious platform builds UI as a wire graph.

---

## 6. Proposed phased roadmap (if the ★ path is chosen)

Nothing here is built yet — this is the order I'd propose so each phase ships value:

- **P0 · Foundation:** define the **App-Definition schema** (the versioned JSON that
  describes data+logic+pages) + a node/component **registry**. Generalise the
  workflow `graph` we already store.
- **P1 · Data pillar:** a visual **data-model builder** (entities, fields, relations)
  + choose **where it's stored** (GRYNX/Neon table, or external). Auto-CRUD APIs.
- **P2 · Logic pillar:** upgrade the Workflow Studio node-graph into a real
  **flow/automation engine** — trigger → condition → action nodes, runnable.
- **P3 · UI pillar:** a **page builder** — drag components onto a canvas, bind them
  to data (P1) and actions (P2).
- **P4 · Runtime + publish:** the generic **runtime** renders a built app for
  end-users; "publish" versions it (we already version + roll back).
- **P5 · Re-express GRYNX** in the Studio, page by page, as the proof.

---

## 7. What I would NOT do (anti-scope, to protect us)

- Not a general website builder / not competing with Bubble/Webflow.
- Not hand-rolling a node-graph from scratch (we use React Flow — already in).
- Not letting the **Admin (factory owner)** build apps — Studio stays **SuperUser**
  (you, the developer). Owners *use* the built apps.
- Not breaking the **live floor**: the running GRYNX keeps working while the platform
  is built beside it; we only "switch" a page to the new runtime when it's proven.

---

## 8. Open questions for you (let's answer these)

1. **Scope:** factory/ops-domain builder, or fully general? (recommend domain.)
2. **Foundation:** build native on GRYNX's stack, or fork an OSS platform as the base?
3. **Editor model:** three specialised surfaces (data / logic / page) sharing one
   definition, or one literal node-graph for everything?
4. **First milestone:** which pillar do we prototype first — **Data** (model+storage),
   **Logic** (flow engine), or **UI** (page builder)?
5. **Multi-tenant?** One app (GRYNX) for now, or many client apps from day one?
   (Affects the definition schema + storage isolation heavily.)
6. **Who writes "code" escapes?** Pure no-code, or allow JS snippets in nodes (like
   Retool/n8n) for power cases?

Answer inline or in the chat — once these are settled I'll turn this into a concrete
technical spec (schema, registry, runtime contract) and *then* we build, phase by
phase.
