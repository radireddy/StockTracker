# Projections & Valuations Page Redesign

**Date:** 2026-07-05  
**Status:** Approved — ready for implementation  
**Mockup:** `docs/mockups/projections-valuation-v4.html`

---

## 1. Problem

The existing page uses an accordion-per-model layout where the P&L table sits above the valuation scenarios. IRR and Buy Price (the key decision outputs) are buried in a flat table row with equal visual weight to everything else. Switching between models requires collapsing/expanding. Context info (Expected Returns, Horizon, Market Cap) is scattered.

---

## 2. Approved Design

### 2.1 Page order (top → bottom)

1. **Model tabs** — horizontal tabs (replaces accordion)
2. **P&L Projections** — collapsible panel (existing grid, wrapped)
3. **Expected Returns** — section label + compact bar with input + context stats
4. **Valuation Scenarios** — V1 tinted-row table with SVG icon chips
5. **PEG Analysis** — strip with Trailing PE, Earnings CAGR, Forward PEG, verdict

### 2.2 Model tabs

- Horizontal tabs along the top, below the page header
- PE / Earnings is always the first tab and carries a **Default** amber badge
- Non-default models get an **×** delete button visible on hover; clicking opens a confirmation dialog
- **+ Add Model** button at the end of the tab row (dashed border, primary colour on hover)
  - On click → popover dropdown listing available model types with icon + name + description
  - Already-added types are greyed out and not clickable
  - Available options at launch: EV / EBITDA, DCF / Cash Flow, SOTP
- Switching tabs swaps the content (P&L + scenarios) for the selected model
- Delete confirmation: modal dialog — "Delete [model name]? This permanently removes all projections and scenarios." Cancel / Delete (destructive red)

### 2.3 P&L Projections

Existing `ProjectionGrid` component, wrapped in a collapsible panel:
- Panel header: chevron + "Profit & Loss" + "₹ Crores" subtitle + "Add Year" ghost button
- Default state: **expanded**
- No other changes to grid internals

### 2.4 Expected Returns

Replaces the inline input that was inside `ValuationScenarios`. Rendered as a compact bar:

```
Expected Returns  [25] % per year  |  ₹5,44,200 Cr  |  ₹1,636  |  ₹19,420 Cr  |  3 yrs
                                      Current MC        CMP        Terminal PAT   Horizon
```

Section label reads **"Expected Returns"** (not "Settings").

### 2.5 Valuation Scenarios — V1 tinted-row table

**Display name change:** `bare` scenario key stays the same in DB/types; display label changes from "Bare" → **"Bear"**.

| Column | Notes |
|---|---|
| Scenario | Chip pill: round icon (SVG) + label |
| Target PE | Editable `<input>` field, centred |
| Target Mkt Cap | Computed, muted text |
| Buying Mkt Cap | Computed, muted text |
| Buy Below | Computed, bold |
| IRR | Computed, large bold, scenario colour |

**Row tints:**  
- Bull: `#f6fef8` / dark: `#071a0e`  
- Base: `#f5f9ff` / dark: `#091628`  
- Bear: `#fffafa` / dark: `#1a0606`

**SVG icons** (inline, filled, white-on-colour inside 26px circle):

- **Bull** — bull head: two upward swept horns, oval face, paired nostrils  
- **Base** — balance scales: vertical pole, horizontal arm, two hanging pans  
- **Bear** — bear head: two round ears, round face, muzzle ellipse, white eyes

### 2.6 PEG Analysis

Existing PEG strip, moved below the scenario table. No functional change.

---

## 3. Components affected

| File | Change |
|---|---|
| `src/components/company/projections-valuation-tab.tsx` | Full restructure: remove accordion, add model tabs + dropdown + delete dialog, reorder sections |
| `src/components/company/valuation-scenarios.tsx` | Replace table layout with V1 chip-row table; extract Expected Returns input to parent; rename Bare→Bear display |
| `src/components/company/projection-grid.tsx` | Wrap caller adds collapsible panel; no internal changes needed |

---

## 4. What does NOT change

- All server actions (`projection-actions.ts`, `valuation-actions.ts`) — unchanged
- DB schema, types, `ScenarioType` union — unchanged (`"bare"` stays in code, only the display label changes)
- Projection strategy implementations (`pe-earnings-strategy.ts`, `ev-ebitda-strategy.ts`) — unchanged
- State logic (cell change, year change, scenario change, save) — moved but not rewritten
- Keyboard navigation in grid — unchanged

---

## 5. Out of scope

- Adding new projection strategy types (DCF, SOTP) — dropdown UI only, no strategy implementation
- Any changes to the Holdings, Timeline, or other company tabs
