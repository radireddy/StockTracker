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

A pure function `hasResearchData(companies)` returns true when **any** company
carries **any** research field:

```ts
hasResearchData = companies.some(c =>
  c.star_rating != null ||       // conviction 1–4
  c.strategy != null ||          // core / satellite
  c.buy_price != null ||         // target buy price
  // any valuation scenario with a non-null figure (base / bare / IRR)
  c.projection_models.some(pm =>
    pm.valuation_scenarios.some(s =>
      s.target_market_cap != null || s.irr != null || s.buy_price != null))
)
```

It lives in a pure lib module (`src/lib/utils/research-data.ts`) so it is unit
testable and counted by coverage (`src/lib/**`). The dashboard page computes it
once against the **full portfolio** (`data.companies`, not the account-filtered
subset, so switching the account filter never changes research presence) and
passes the resulting boolean down as a prop. Because it is a prop derived in the
same render pass, columns/filters cannot flip mid-scroll.

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
  any not-yet-rated companies. Wording must be accurate: un-rated holdings are
  already counted in the card as an implicit 1★, so the nudge says they are
  "assumed 1★ until you rate them" — NOT "rate them to include" (they are
  already included).
- The **Allocation** tab, **Star** filter, and **Core/Satellite** filter are
  all available.

## Affected components

| File | Change |
| --- | --- |
| `src/lib/utils/research-data.ts` (new) | Pure `hasResearchData(companies)` detector + its input type. |
| `src/components/dashboard/research-guidance-card.tsx` (new) | The buttonless guidance card. |
| `src/app/(authenticated)/dashboard/page.tsx` | Compute the flag from `data.companies`; render guidance card vs. `AllocationSummaryBar`; pass `hasResearchData` to `CompaniesTable` and `MobileDashboard`. |
| `src/components/dashboard/companies-table.tsx` | Gate the 6 research columns, the Star & Type filters, and the Allocation view toggle on the flag (holdings only; watchlist unchanged). |
| `src/components/dashboard/mobile-dashboard.tsx` | Gate the Allocation filter section; render a compact guidance card; pass the flag to `CompanyCard`. |
| `src/components/dashboard/company-card.tsx` | When the flag is false, hide the research strip, allocation bar, and allocation status stripe. |

Both the desktop (`CompaniesTable`) and mobile (`MobileDashboard` /
`CompanyCard`) views are covered. `AllocationSummaryBar` itself is unchanged —
the page chooses whether to render it. No data-model, migration, or API changes
are required — all needed fields are already loaded by
`src/app/api/dashboard/route.ts`.

Watchlist portfolios are unaffected: the flag is applied only for
`portfolioType === "holdings"`; watchlists always show research UI.

## Non-goals / YAGNI

- No dismiss / "Not now" affordance — the guidance card simply disappears once
  research data exists.
- No quick-rate modal or dedicated CTA button — the user rates companies via the
  existing company detail/edit flow.
- No explicit per-portfolio "mode" setting — disclosure is fully automatic.
- No per-column independent reveal — reveal is all-or-nothing.

## Testing

The repo uses Vitest (jsdom) but has **no** React Testing Library, and coverage
is scoped to `src/lib/**` / `src/types/**`. So:

- **Automated (TDD):** Vitest unit tests for `hasResearchData` — false when all
  research fields are null/absent across all companies; true when any single
  field (star, strategy, buy_price, or a valuation scenario figure) is present
  on any company; false for an empty list.
- **Component changes** are verified with `npx tsc --noEmit`, `npm run lint`,
  `npm run build`, and manual check in the running app (holdings-only portfolio
  omits the six research columns / two filters / Allocation tab and shows the
  guidance card; adding one star reveals all of them). No RTL tests are added —
  that would be new tooling outside this scope.
