# Multi-Theme System Design

**Date:** 2026-07-11  
**Branch:** feat/ra-subscriber-marketing  
**Status:** Approved — ready for implementation

---

## Problem

The current UI is monochromatic: primary, secondary, and accent tokens all share hue 168 (teal-green). Secondary and accent are just washed-out shades of primary — indistinguishable in practice. Green and red are also used as the brand color, which conflicts with their semantic role (profit/loss, buy/sell signals).

## Solution

Ship three distinct color themes (A, B, C) with full light and dark variants. Users can switch at any time via the Settings page. Default is **Theme B (Sapphire Blue + Cyan), light mode**.

Green and red remain exclusively semantic: profit/loss, BUY/SELL signals, positive/negative MoS.

---

## Themes

### A — Slate Indigo + Amber
- Primary: `#4338ca` (indigo-700) / dark: `#818cf8`
- Secondary: soft lavender-grey surfaces
- Accent: `#d97706` amber — used for stars, ratings, watchlist highlights
- Feel: Bloomberg-meets-Notion, professional, data-dense

### B — Sapphire Blue + Cyan *(default)*
- Primary: `#0369a1` (sky-700) / dark: `#38bdf8`
- Secondary: ice-blue surfaces
- Accent: `#0e7490` cyan — used for interactive highlights, focus
- Feel: Modern data dashboard, clear and authoritative

### C — Deep Violet + Saffron Gold
- Primary: `#7c3aed` (violet-600) / dark: `#a78bfa`
- Secondary: lavender-mist surfaces
- Accent: `#d97706` saffron-amber — echoes Indian market warmth
- Feel: Premium, distinctive, warm — stands out in Indian fintech

### Semantic colors (all themes, both modes)
- Positive (profit, BUY, +MoS): green — `#16a34a` light / `#22c55e` dark
- Negative (loss, SELL, −MoS): red — `#dc2626` light / `#f87171` dark
- Warning / neutral signal: amber-orange (unchanged)
- Stars rating: amber-gold (same as accent in A and C; separate token in B)

---

## Architecture

### Two orthogonal axes

```
color-theme (A / B / C)  ×  mode (light / dark)
```

These are independent. next-themes already handles `light/dark` via a `.dark` class on `<html>`. We add a `data-color-theme` attribute on `<html>` for the A/B/C axis.

CSS variables are scoped to the intersection. B is the default — it lives in `:root` / `.dark` (no attribute needed). A and C override via `[data-color-theme]`:

```css
/* Theme B — Light (default, no attribute required) */
:root { --primary: #0369a1; ... }

/* Theme B — Dark */
.dark { --primary: #38bdf8; ... }

/* Theme A — Light (overrides :root when attribute is present) */
[data-color-theme="a"] { --primary: #4338ca; ... }

/* Theme A — Dark */
.dark[data-color-theme="a"] { --primary: #818cf8; ... }

/* Theme C — Light */
[data-color-theme="c"] { --primary: #7c3aed; ... }

/* Theme C — Dark */
.dark[data-color-theme="c"] { --primary: #a78bfa; ... }
```

`ColorThemeProvider` sets `data-color-theme` to `"a"` or `"c"` only. When the stored value is `"b"` or absent, the attribute is removed so `:root` / `.dark` take effect naturally.

### Why not 6 separate next-themes values?

`next-themes` supports `themes: ["a-light", "a-dark", ...]` but that couples the two axes, losing system-preference dark mode for free. Keeping them orthogonal means next-themes' `system` preference still works, and the color theme is a separate user choice layered on top.

### Persistence

- **Dark/light**: already persisted by next-themes via `localStorage` key `theme`.
- **Color theme (A/B/C)**: stored in `localStorage` key `color-theme`. Read on mount; written on change.
- **Default**: `color-theme` absent from storage → treat as `b`.

---

## Components to create / modify

### New files

| File | Purpose |
|------|---------|
| `src/components/theme/color-theme-provider.tsx` | React context + localStorage persistence for A/B/C choice. Writes `data-color-theme` to `<html>`. |
| `src/components/theme/color-theme-selector.tsx` | Visual picker UI — three labeled swatches (A/B/C). Used in Settings. |
| `src/lib/color-themes.ts` | Theme metadata: id, name, description, primary hex (for swatch previews). |

### Modified files

| File | Change |
|------|--------|
| `src/app/globals.css` | Replace `:root` / `.dark` blocks with 6 scoped variable sets (3 themes × 2 modes). Keep all existing token names (`--primary`, `--secondary`, `--accent`, etc.) so no component changes are needed. |
| `src/app/layout.tsx` | Wrap with `<ColorThemeProvider>` outside `<ThemeProvider>`. |
| `src/app/(authenticated)/settings/page.tsx` | Add "Appearance" section with `<ColorThemeSelector>` and existing dark/light `<ThemeToggle>`. |

### Unchanged

All existing components — they already use token names (`text-primary`, `bg-secondary`, `border`, etc.). No component-level color changes needed.

---

## CSS variable token mapping

All existing token names are preserved. The values change per theme, but the names stay the same:

```
--primary / --primary-foreground
--secondary / --secondary-foreground  
--accent / --accent-foreground
--muted / --muted-foreground
--background / --foreground
--card / --card-foreground
--border / --input / --ring
--sidebar / --sidebar-* (all 6 sidebar tokens)
--chart-1 through --chart-5
--positive / --warning / --amber (semantic — identical across all themes)
```

---

## Settings UI

The Appearance section in Settings will show:

```
Appearance
──────────
Color theme    [● Indigo] [● Sapphire ✓] [● Violet]
Mode           [☀ Light ✓] [🌙 Dark] [⊙ System]
```

Swatches show the primary + accent colors for each theme. Selected state has a ring. Accessible via keyboard (arrow keys within each group, `role="radiogroup"`).

---

## Accessibility

- All 6 theme × mode combinations meet WCAG AA contrast (4.5:1 for body text, 3:1 for large text).
- Theme selection is a `role="radiogroup"` with visible focus rings.
- `prefers-reduced-motion` already honoured by existing CSS.
- System dark mode preference respected by next-themes when user selects "System".

---

## Out of scope

- Per-company or per-portfolio theme overrides.
- Custom theme builder / color picker.
- Syncing theme preference to the server/database (localStorage only, per device).
