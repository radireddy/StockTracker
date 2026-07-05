# Holdings-only progressive disclosure — design

**Date:** 2026-07-05
**Status:** Approved, ready for planning

## Problem

Many users will use StockTracker only to consolidate holdings across broker
accounts. They import (or manually add) positions but never enter *research
data* — conviction star ratings, Core/Satellite type, target buy price, or
valuation scenarios.

For these users the dashboard is broken and confusing:

- The **Allocation health** card shows garbage: because every company defaults
  to an implicit 1★, it renders a single "1★ · 100% · OVER" bar.
- Six of the thirteen portfolio columns (**Star, Type, Target Buy, MoS%, Base,
  Bare**) are permanently empty (`–`).
- The **Star** filter (1–4★) and **Core/Satellite** filter offer choices that
  match nothing.
- The entire **Allocation** tab (target ranges, DELTA, STATUS) is meaningless.

## Goal

Adapt the dashboard so a holdings-only portfolio is clean and useful, while
*guiding* the user toward research features without hiding them so thoroughly
that it creates a discovery problem.

## Core decision: progressive disclosure with a guidance card

A single derived signal drives everything. When **no** company in the current
portfolio has any research data, the dashboard shows a **holdings-only** layout
plus an informational **guidance card**. The moment **any** research field is
saved on **any** company, the full research UI appears (all-or-nothing reveal).

### The detection signal

Computed once per render, memoized on the companies array (no extra fetch, no
re-render churn — derived in the same render pass so columns/filters cannot flip
mid-scroll):

```ts
hasResearchData = companies.some(c =>
  c.star_rating != null ||       // conviction 1–4
  c.strategy != null ||          // core / satellite
  c.buy_price != null ||         // target buy price
  hasValuationScenarios(c)       // base / bare / IRR scenarios exist
)
```

This lives alongside the existing consolidation logic in
`src/hooks/use-dashboard-data.ts` and is exposed to the dashboard components.

### State A — holdings-only (`hasResearchData === false`)

- **Portfolio table:** render only position columns — Company, Qty, Avg Buy,
  CMP, Cost, Cur. Value, P&L %, P&L ₹. The six research columns (Star, Type,
  Target Buy, MoS%, Base, Bare) are **omitted from the column set** (not
  rendered as empty `–` columns).
- **Filters:** the **Star** dropdown and the **Core/Satellite** dropdown are
  **not rendered**. (Account filter and search behave as today.)
- **Allocation tab:** the Portfolio/Allocation view toggle hides the
  **Allocation** option — there is nothing to allocate without conviction.
- **Allocation health card → guidance card:** the allocation card slot renders
  an informational card instead:
  - Title: **"📊 Unlock allocation & valuation tracking"**
  - Source-neutral subtext: *"You're tracking N companies across M account(s)."*
    (No mention of "import" — holdings may be added manually.)
  - A short instruction: **"Click on a company to add its rating and research
    data."**
  - Three payoff rows mapping input → what it unlocks:
    - ⭐ **Rate conviction (1–4★)** → unlocks *Allocation health*
    - 🎯 **Set a target buy price** → unlocks *MoS %*
    - 📈 **Add valuation scenarios** → unlocks *Base / Bare* targets
  - **No buttons or CTAs.** The card is purely informational; the action is for
    the user to click a company row, which already opens the company detail /
    edit screens where these fields are entered.

### State B — research-active (`hasResearchData === true`)

Current behavior, unchanged:

- All 13 columns render. Companies without a given field show `–` — acceptable
  now, because the user has opted into research.
- The real **Allocation health** card renders. It should nudge the user to rate
  any not-yet-rated companies (e.g. "18 companies not yet rated — rate them to
  include").
- The **Allocation** tab, **Star** filter, and **Core/Satellite** filter are
  all available.

## Affected components

| File | Change |
| --- | --- |
| `src/hooks/use-dashboard-data.ts` | Derive & expose `hasResearchData` (memoized). |
| `src/components/dashboard/companies-table.tsx` | Gate the 6 research columns, the Star & Type filters, and the Allocation view toggle on `hasResearchData`. |
| `src/components/dashboard/allocation-summary-bar.tsx` | When `hasResearchData` is false, render the guidance card; otherwise render the allocation bars (+ un-rated nudge). |
| (new) guidance card | May be a small new component or a branch inside the allocation card component. |

No data-model, migration, or API changes are required — all needed fields are
already loaded by `src/app/api/dashboard/route.ts`.

## Non-goals / YAGNI

- No dismiss / "Not now" affordance — the guidance card simply disappears once
  research data exists.
- No quick-rate modal or dedicated CTA button — the user rates companies via the
  existing company detail/edit flow.
- No explicit per-portfolio "mode" setting — disclosure is fully automatic.
- No per-column independent reveal — reveal is all-or-nothing.

## Testing

- Unit-test the `hasResearchData` derivation: false when all research fields are
  null/absent; true when any single field (star, strategy, buy_price, or a
  valuation scenario) is present on any company.
- Component tests: holdings-only portfolio omits the six research columns, the
  two filters, and the Allocation tab, and renders the guidance card; a
  portfolio with one starred company renders all columns, both filters, the
  Allocation tab, and the allocation bars.
