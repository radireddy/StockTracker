# Screener-Style UI Redesign

**Date**: 2026-06-20
**Reference**: https://www.screener.in/company/JMFINANCIL/consolidated/#top
**Approach**: Full Screener Rebuild (Approach A)

## Overview

Redesign both the company detail page and dashboard to match screener.in's data-dense, clean, vertical-scroll aesthetic. Keep shadcn/ui primitives (Table, Input, Button) but completely rework layout, spacing, and page structure.

## Key Decisions

- **Company detail page**: Vertical scroll (no tabs) with sticky section nav
- **Dashboard**: Dense data table with tighter spacing, alternating rows
- **Top metrics**: Investment-focused grid (MCap, Buy Price, MoS%, Star, Strategy, Horizon, IRRs)
- **Theme**: Light + dark mode, screener-inspired flat design
- **No cards/shadows**: Flat design with thin border separators

---

## Company Detail Page

### Structure (top to bottom)

1. **Company Header Bar**
   - Company name (text-xl font-semibold) + current price + % change
   - Edit button (right-aligned)
   - No card — just a section with bottom border

2. **Metrics Grid**
   - 2-row × 4-6 column grid
   - Row 1: Market Cap, Buy Price, MoS%, Star Rating, Strategy, Horizon
   - Row 2: Base IRR, Bull IRR, Bare IRR, Buy Signal
   - Labels: `text-xs uppercase tracking-wide text-muted-foreground`
   - Values: `text-lg font-semibold tabular-nums`
   - Thin separators between metrics (vertical borders or gap)

3. **Sticky Section Nav**
   - Horizontal nav: Thesis | Financials | Valuation | Timeline | Highlights
   - Sticks below app header on scroll
   - Active section underlined (IntersectionObserver tracking)
   - Click smooth-scrolls to section

4. **Sections** (each with `id` for scroll targeting)

   **Investment Thesis**
   - Rich text editor (Tiptap) — keep existing functionality
   - Section heading with thin bottom border, no card wrapper
   - Floating save button

   **Financial Model**
   - Horizontal scroll table: years as columns, metrics as rows
   - Keep existing computation engine and override system
   - Styling: compact cells (px-3 py-1.5), right-aligned numbers
   - Year headers: blue bg for estimates
   - Add/remove year buttons at table edges

   **Valuation**
   - 3-row scenario table (Bull/Base/Bare)
   - Columns: P/E, Target MCap, IRR, Buying MCap, Buy Price
   - Color-coded row accents (green/blue/orange)
   - Expected returns input above table

   **Timeline**
   - Entries as compact rows (not cards) — quarter label, date, content
   - Add entry form at top
   - Delete via inline button

   **Highlights**
   - Rich text editor (Tiptap) — same pattern as thesis

---

## Dashboard Page

### Layout

```
Header
Title bar: "All Companies (31)" + [Add Company] button
Filter bar: Search | Star filter | Strategy filter | Buy signals toggle
Dense data table
```

### Table Columns

| Column | Align | Sortable | Notes |
|--------|-------|----------|-------|
| Company (Name + Symbol) | left | ✓ | Symbol as subtle badge |
| Star Rating | center | ✓ | ★ emoji display |
| Strategy | center | — | Plain text or tiny badge |
| Sector | left | — | New column |
| Market Cap | right | ✓ | ₹ Cr format |
| Buy Price | right | ✓ | ₹ format |
| CMP | right | ✓ | ₹ format |
| MoS% | right | ✓ | Color-coded |
| Base IRR | right | — | % format |
| Buy Signal | center | — | Green BUY badge or dash |

### Table Styling
- Row padding: `py-1.5 px-3` (compact)
- Alternating row backgrounds: `even:bg-muted/30`
- Sticky column headers
- No card wrapper — table directly on page
- Right-aligned numeric columns with `tabular-nums`
- Row hover: subtle background change
- Row click navigates to company detail
- Delete via context menu or detail page (not inline column)

---

## Styling System

### Typography
- Company name: `text-xl font-semibold`
- Section headings: `text-base font-medium` + `border-b`
- Metric labels: `text-xs text-muted-foreground uppercase tracking-wide`
- Metric values: `text-lg font-semibold tabular-nums`
- Table data: `text-sm tabular-nums`
- All numbers: right-aligned

### Spacing
- Page padding: `px-4 md:px-8`
- Max width: `max-w-6xl mx-auto`
- Section gaps: `space-y-8`
- Table cells: `px-3 py-1.5`

### Colors
- Light mode: White background, subtle gray borders
- Dark mode: Dark background, matching density
- No heavy shadows or card elevation
- Borders: `border-border/50` (very subtle)
- Section nav active: underline accent
- Status colors: green (positive), red (negative), yellow (neutral) — unchanged

### Containers
- No Card components for wrapping sections
- Thin `border-b` separators between sections
- Tables: `border` but no rounded corners
- Flat design throughout

---

## Components Changed

| Component | Change |
|-----------|--------|
| `company/[id]/page.tsx` | Rebuild: tabs → vertical scroll with section nav |
| `company-header.tsx` | Rebuild: card → header bar + metrics grid |
| `financial-model-tab.tsx` | Restyle: tighter cells, screener table look |
| `valuation-tab.tsx` | Restyle: remove card, compact table |
| `thesis-tab.tsx` | Restyle: remove card, section heading |
| `timeline-tab.tsx` | Restyle: entries as rows, not cards |
| `companies-table.tsx` | Rebuild: dense screener-style table |
| `layout.tsx` | Adjust padding, max-width |
| New: `section-nav.tsx` | Sticky scroll-based section navigator |

## Components Unchanged
- `app-header.tsx` — keep existing sticky header
- `user-nav.tsx` — keep dropdown
- `company-form.tsx` — keep add form
- All shadcn/ui primitives — keep using Table, Input, Button, etc.
- Server actions — no data layer changes
- Types/database — no schema changes
