# GRYNX — Design Language (extracted from mockups)

> Derived from the V1 UI mockups. **Not final** — minor logo changes pending, and
> exact hex/fonts will be locked from the supplied asset files. This captures the
> visual system so the build stays consistent. Aesthetic = **industrial command-center / technical HUD**: true-black canvas, heavy condensed display type, monospace data labels, single electric-blue accent.

## 1. Color tokens (estimated — confirm from logo files)
| Token | Value (approx) | Use |
|-------|----------------|-----|
| `--bg` | `#000000` | app canvas (true black) |
| `--surface` | `#0B0D10` | cards / panels |
| `--surface-raised` | `#121519` | inputs, raised rows |
| `--border` | `#23282F` | hairline dividers, card borders |
| `--border-strong` | `#2E343C` | emphasized borders |
| `--text` | `#FFFFFF` | primary text, big numbers |
| `--text-secondary` | `#9AA0A6` | labels, captions |
| `--text-tertiary` | `#6B7177` | footnotes, hints |
| `--brand-blue` | **`#0449F1`** *(sampled from D-LYFT logo)* | primary actions, accents, active state, underlines, totals |
| `--danger` | `#E5392E` | RC / alerts / destructive |
| `--success` | white / `--brand-blue` | "GOOD" status (monochrome) |
| `--warning` | **`#F5A623`** (amber) | **DELAY / ALERT** — the metric number itself renders in amber |

> Status rule (confirmed): GOOD = monochrome; **DELAY / ALERT render the number in
> amber `#F5A623`**. Brand blue stays reserved for primary action + neutral accents so
> amber reads unambiguously as "attention".

## 2. Typography
The system runs on **two type families** (the GRYNX wordmark is a bespoke logotype, used as an image — not a system font).

| Role | Look in mockups | My top pick (review) | Alternates |
|------|-----------------|----------------------|------------|
| **Display** — CREATE JOB, titles, KPI numbers (23, 1287) | very heavy **condensed** grotesque, ALL CAPS, tight tracking, squared terminals | **Saira Condensed** (Black/ExtraBold) | Anton · Oswald · Khand |
| **Mono** — labels, body, captions, IDs, footer (SYSTEM ONLINE, `[02]`, "Create a new production job") | monospace, ALL CAPS for labels, **wide tracking 0.1–0.28em**; also used for supporting body text | **Space Mono** | JetBrains Mono · IBM Plex Mono · Martian Mono |

> Note: supporting/body text in the mockups is **monospace too** (not a separate grotesque) —
> that's core to the HUD feel. So only two fonts to lock.
> If you want a system font echoing the GRYNX logo's squared style for headers, closest are
> **Chakra Petch / Oxanium / Quantico** — but the logo itself stays an image.

Fallback stacks: display → `"Saira Condensed", system-ui, sans-serif`; mono → `"Space Mono", ui-monospace, monospace`.

Type scale (px): display 96/72/48/32 · title 28/22 · body 16/14 · label/mono 13/11. Uppercase tracking on mono ~0.2em.

## 3. Layout shells (global chrome)
- **Top utility bar:** `D-LYFT logo │ SYSTEM ONLINE │ SYNC <time> │ STATUS OPERATIONAL │ NET SECURE🔒 │ USER.ID` (+ hamburger on inner screens). On the GRYNX-branded inner screens it's `D-LYFT │ GRYNX │ status dots │ user/role`.
- **Bottom utility bar:** `GRYNX v<ver> │ UPTIME <d/h/m> │ DATA ENCRYPTED AES-256` (mono, tertiary).
- **Screen header:** `← <BIG TITLE>` + secondary subtitle, optional right-side meta (LAST UPDATED / refresh).
- **Content:** stacked cards on phone; 2-column card grid on iPad/desktop. Section header = small caps label + short blue underline accent.

## 4. Component inventory (from mockups)
- **Utility bar** (top/bottom) — mono status strip.
- **Big nav row** — huge condensed title + sublabel + numeric badge `[02]` + `→` (Admin home).
- **Stat block** — caption + large number + blue underline (KPIs).
- **List row w/ icon** — dept name + count / status (Job Pipeline, Dept Health).
- **Priority toggle** — URGENT (blue outline + bolt) / NORMAL (mono outline).
- **Pipeline breadcrumb** — `DESIGN > PURCHASE > … > FG STOCK`, "N STEPS", expandable.
- **PIN input** — 6 separate boxes + ENTER button + "FORGOT PIN?".
- **Primary button** — solid blue, full width (CREATE JOB w/ PDF icon, ENTER).
- **Danger button** — solid red (RC).
- **Alert row** — ⚠ label + count + `→` (Alerts & Attention).
- **Activity feed item** — bullet + entity (bold) + action + timestamp.
- **Editable table** — MODEL / QUANTITY rows with pencil, ADD MODEL, TOTAL accent.

## 5. Principles confirmed by the mockups
- One accent color only (electric blue). Everything else is monochrome on black → high contrast, factory-readable.
- Data is dressed as a "system readout" (uptime, encryption, sync clock, IDs) — reinforces reliability. Keep these honest (real values, not theater) where shown to users.
- Large tap targets; primary action always full-width at the bottom.

## 6. To lock this down (need from owner)
1. Drop logo + screenshot files into `reference/logos` and `reference/screenshots`.
2. Confirm the **display** and **mono** font families (or I'll match the closest free Google Font).
3. Decide DELAY/ALERT status coloring.
Then I generate `theme.ts` tokens (colors, type scale, spacing, radii) shared across web + native.
