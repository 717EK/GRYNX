# 13 · App Studio — vision & discussion sheet

**Status: ALIGNED — spec'd, ready to build Phase 1 on your go.** This sheet got us
aligned on what we're building; §0 has the locked decisions and §9 is the concrete
Phase-1 spec.

## 0. Decisions (LOCKED · 2026-06-20)

| # | Decision | Choice |
|---|---|---|
| A | Scope | **Factory/ops-domain app builder** (not a general Bubble competitor) |
| B | Foundation | **Build native on the GRYNX stack** (Fastify/Prisma/Neon/React) — no fork |
| C | Editor model | **Three specialised surfaces over ONE app-definition** (data modeller · logic flow · page builder) |
| D | First pillar | **Data model + storage** |
| E | Tenancy | **Multi-app-ready, run GRYNX first** (definition + storage hold many apps; build one now) |
| F | Code escapes | **Allow JS snippets in nodes** (visual-first, code for the hard cases) |

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

## 8. Open questions — ANSWERED

All six settled — see §0. Summary: domain builder · build native · three surfaces ·
data pillar first · multi-app-ready · allow JS escapes.

---

## 9. Phase-1 technical spec (App-Definition kernel + Data pillar)

Goal of Phase 1: stand up the **kernel** (how an app is stored & versioned) and the
**Data pillar** (model entities + store records + auto-CRUD) — *beside* the running
GRYNX, touching nothing live. All additive.

### 9.1 The kernel — App-Definition (mirrors the workflow engine we already have)

Three additive tables, same pattern as `WorkflowDefinition/Version`:

```
App         { id, key (unique e.g. "grynx"), name, isActive, publishedVersionId? }
AppVersion  { id, appId, version, status(draft|published|archived),
              definition Json,  createdById, publishedAt? }     // the whole app, versioned
AppRecord   { id, appId, entityKey, data Json, createdAt, updatedAt, version }  // run-time rows
```

`AppVersion.definition` (JSON) is the single source of truth for an app:

```jsonc
{
  "entities": [
    { "key": "order", "name": "Order",
      "fields": [
        { "key": "orderNo", "name": "Order No", "type": "text", "required": true, "unique": true },
        { "key": "client",  "name": "Client",   "type": "text", "required": true },
        { "key": "status",  "name": "Status",   "type": "select", "options": ["new","planning","..."] },
        { "key": "items",   "name": "Items",     "type": "relation", "to": "orderItem", "many": true }
      ],
      "storage": { "kind": "native" }   // P1: native JSON-row store; later: external/own-table
    }
  ],
  "flows": [],   // Phase 2 (logic)
  "pages": [],   // Phase 3 (UI)
  "connectors": []
}
```

Field types (P1): `text · number · boolean · date · datetime · select · relation · json · file`.
**Multi-app-ready:** many `App` rows; every `AppRecord` is scoped by `appId` →
isolation by construction. GRYNX = one `App{key:"grynx"}`. A 2nd client = another row.

### 9.2 Storage model (P1 = native JSON-row store)

Each entity's rows live in the generic `AppRecord` table (`appId + entityKey + data`),
**not** a per-entity Postgres table. This is the Budibase-internal-DB approach: no
per-entity DDL/migrations, fully dynamic, validated against the entity schema at write
time. (A later "own real table" storage option can be added for heavy entities.)

### 9.3 Auto-CRUD runtime (the data engine)

Generic, definition-driven endpoints (the runtime that *interprets* the schema):

```
GET    /api/v1/apps/:appKey/data/:entityKey        list (filter/sort/paginate)
POST   /api/v1/apps/:appKey/data/:entityKey        create (validated vs entity schema)
GET    /api/v1/apps/:appKey/data/:entityKey/:id     read
PATCH  /api/v1/apps/:appKey/data/:entityKey/:id     update
DELETE /api/v1/apps/:appKey/data/:entityKey/:id     delete
```

One handler reads the published `AppVersion.definition`, finds the entity, validates the
payload (Zod built from the field list), and reads/writes `AppRecord`. Unique/required/
relation checks enforced from the schema. (Permissions land with the UI/role phase.)

### 9.4 The Data-modeller surface (Studio, SuperUser-only)

An **ER-style node canvas** (reuse React Flow — consistent with the logic pillar):
entities are nodes (showing their fields), relations are edges. A side panel edits the
selected entity's fields (key/name/type/required/unique/options/relation). Save → writes
a draft `AppVersion`; Publish/rollback reuse the exact mechanism the Workflow Studio
already has. So "every feature is a selectable node" holds for data too.

### 9.5 Scope guards (what Phase 1 deliberately does NOT do)

- Does **not** migrate GRYNX's real models — it runs the generic engine *beside* them.
- No page builder, no logic flows yet (Phases 3 & 2).
- No external/own-table storage yet (native JSON-row store only).
- Lives under the SuperUser Studio; built apps aren't user-facing until the UI phase.

### 9.6 Phase-1 deliverable checklist

1. Additive migration: `App`, `AppVersion`, `AppRecord`.
2. `/apps` routes: create app + versions + publish/rollback (clone of workflow routes,
   SuperUser-gated).
3. Generic auto-CRUD `/apps/:appKey/data/:entityKey` (schema-validated).
4. Studio **Data** surface: ER node-canvas + field editor + save/publish.
5. Seed `App{key:"grynx"}` with a couple of example entities to prove the loop
   (model → store a record → read it back).

> On your **go**, I build Phase 1 to this spec (additive, nothing live touched),
> deploy it behind the SuperUser Studio, and demo the model→store→read loop. Phases
> 2 (logic flows) and 3 (page builder) follow, then P5 re-expresses GRYNX itself.
