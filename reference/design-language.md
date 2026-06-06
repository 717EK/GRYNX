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
| `--brand-blue` | `#1E5BFF` *(sample from logo)* | primary actions, accents, active state, underlines, totals |
| `--danger` | `#E5392E` | RC / alerts / destructive |
| `--success` | reuse white/`--brand-blue` | "GOOD" status (currently monochrome) |
| `--warning` | TBD (amber?) | "DELAY"/"ALERT" — confirm if a distinct color is wanted |

> Status chips in the dashboard (GOOD / DELAY / ALERT) currently read as monochrome
> text. Decide whether DELAY/ALERT get color (e.g. amber/red) or stay mono.

## 2. Typography
Three roles. Exact families to confirm from assets; stacks below are the intended look + safe fallbacks.

| Role | Look | Candidate / fallback |
|------|------|----------------------|
| **Display** (CREATE JOB, big titles, KPI numbers) | very heavy **condensed** grotesque, ALL CAPS, tight tracking | "Saira Condensed" / "Khand" / "Anton" → `system-ui` |
| **Mono / data labels** (SYSTEM ONLINE, SYNC 10:42:31, `[02]`, IDs, footer) | monospace, ALL CAPS, **wide tracking 0.1–0.28em** | "Space Mono" / "JetBrains Mono" / "IBM Plex Mono" → `ui-monospace` |
| **Body / UI** (descriptions, table cells) | clean neutral grotesque | "Inter" → `system-ui` |
| **GRYNX wordmark** | custom geometric (notched Y) | **image asset**, not a system font |

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
