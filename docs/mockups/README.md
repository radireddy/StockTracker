# Dashboard Redesign — Mockups & Handoff

Interactive, self-contained HTML mockups for the **dashboard redesign** (desktop + mobile),
plus every decision made while designing them. Start here before implementing.

> Scope is **the dashboard only** for now. Company detail, Settings, Import, forms/auth are
> a later pass in the same design language.

## Files

| File | What it is |
|------|-----------|
| `dashboard-desktop.html` | Desktop dashboard — open in a browser, fully interactive |
| `dashboard-mobile.html` | Mobile dashboard (phone frame) — fully interactive |
| `screenshots/` | Rendered stills of each state (below) |

**How to view:** open either `.html` directly in a browser (they're self-contained, no build/server).
Toggle 🌙 **Dark** bottom-right. Everything is clickable — view toggles, portfolio pills, the
mobile filter sheet, bottom nav, and empty-state pills.

Published (view-online) copies from the design session:
- Desktop: https://claude.ai/code/artifact/9f8cfadd-03a2-4197-bd4b-1b2604a7ef69
- Mobile: https://claude.ai/code/artifact/482b4aee-422a-4809-9995-a25600a7e90a

## The one thing to know

This is **not a re-theme**. The app already shares the landing page's design tokens (the OKLCH
teal palette in `src/app/globals.css`) and the `ui/*` component library. The redesign is about
*applying the landing page's polish* — spacing rhythm, `rounded-xl` cards with hover, soft shadows,
gradient page headers, section headings, color discipline, subtle motion — to the dashboard.
The mockups use the **real tokens**, so they're a faithful preview, not a different look.

## Decisions locked with the user

- **Depth:** full redesign of the dashboard (approved against the mockups).
- **Dense table stays** on desktop (user preference) — polished, not replaced by cards.
- **No "Today" and no "XIRR"** columns/stats — we don't have that data.
- **Portfolio navigation = type toggle + pills.** Portfolios and watchlists are the *same* entity
  (`portfolios.type IN ('holdings','watchlist')`); a user can have many of each. Navigate with a
  `Portfolios | Watchlists` toggle + a one-click pill row of the portfolios of that type. The old
  header portfolio dropdown is replaced by this on-page control.
- **Allocation view = grouped by star, every column kept.** Star groups (4★→1★), each with a group
  header (weight vs. target band, Under/In-Range/Over tag, rebalance ₹ action). Per-company rows keep
  CMP, Target Buy, Inv %, Cur %, Target band, the **Invested Status** RangeBar, Status, Delta, MoS%.
  The **Invested | Current** toggle flips %, status bar, deltas, and group headers.
- **Mobile bottom nav** holds: `Holdings · Watchlist · Add · Portfolio`. `Add` (company, circle-plus)
  and `Portfolio` (new portfolio, folder-plus) are teal actions; Holdings/Watchlist are the view/type
  switch. A user avatar sits on the left.
- **Mobile: search collapsed into the filter.** One control labeled **"Search, sort & filter"** opens
  a bottom sheet containing, top to bottom: **Search → Account → Sort by → Allocation → Done**. The
  "All accounts" filter moved out of the header into this sheet.
- **Empty states** designed for Holdings and Watchlist (see below). When empty, the total-value hero
  and the filter bar hide; portfolio pills stay so you can switch.

## Views & states (screenshots)

Desktop:
- `screenshots/desktop-portfolio.png` — Holdings ▸ Portfolio (dense table, all columns)
- `screenshots/desktop-allocation.png` — Holdings ▸ Allocation (star-grouped, all columns)
- `screenshots/desktop-watchlist.png` — Watchlists (research-only)

Mobile:
- `screenshots/mobile-holdings.png` — Holdings (hero + cards)
- `screenshots/mobile-watchlist.png` — Watchlist (research cards)
- `screenshots/mobile-filter-expanded.png` — the expanded Search/sort/filter sheet
- `screenshots/mobile-empty-holdings.png` — Holdings empty state
- `screenshots/mobile-empty-watchlist.png` — Watchlist empty state

## Data model (relevant bits)

- `portfolios` table: `type` = `'holdings' | 'watchlist'`, plus `color`, `is_default`, `sort_order`.
- A **watchlist is a portfolio** with `type='watchlist'` (research-only; no holdings rows).
- `holdings` are per `(portfolio_id, account_id, company_id)`. Only holdings-type portfolios have them.
- Multiple holdings portfolios *and* multiple watchlists per user are fully supported already.

## Reuse — keep this logic, only restyle presentation

- `src/lib/utils/calculations.ts`: `getEffectiveRanges`, `getRangeForStar`, `getAllocationStatus`,
  `getAllocationDelta`, `marginOfSafety`, `effectiveBuyPrice`, `isBuySignal`, `computeLiveIrr`, `fmt*`.
- `src/lib/utils/dashboard-metrics.ts`: `computeHoldingMetrics`, `totalCurrentValue`, `holdingSortValue`.
- `src/hooks/use-dashboard-data.ts`: `useDashboardData`, `consolidateHoldings`.
- `RangeBar` in `src/components/dashboard/companies-table.tsx` — reuse for member + group bars.
- `src/hooks/use-portfolio-context.tsx`, `CreatePortfolioDialog`, all `ui/*` primitives.

## Files most likely to change (dashboard scope)

- `src/app/(authenticated)/dashboard/page.tsx` — page header (gradient), inserts portfolio nav.
- `src/components/portfolio/portfolio-nav.tsx` *(new)* — type toggle + pills (lift the pill markup from
  `mobile-dashboard.tsx`'s `sameType` block); move `firstOfType` from `mobile-bottom-nav.tsx` to a shared util.
- `src/components/layout/app-header.tsx` — remove the dashboard-only `PortfolioDropdown` (nav moves on-page).
- `src/components/dashboard/portfolio-pnl-bar.tsx` — becomes the summary hero card (no Today/XIRR).
- `src/components/dashboard/allocation-summary-bar.tsx` — allocation-health card treatment.
- `src/components/dashboard/companies-table.tsx` — restyle Portfolio view; restructure Allocation view
  into star groups (keep all columns + Invested/Current toggle + RangeBar + tooltips).
- `src/components/dashboard/mobile-dashboard.tsx`, `company-card.tsx`, `src/components/layout/mobile-bottom-nav.tsx`
  — mobile polish, bottom-nav Add + New-portfolio, filter sheet (search+account+sort+filter), empty states.

See `docs/plans/2026-07-05-dashboard-redesign.md` for the step-by-step implementation plan.

## Accessibility & theming (must hold)

- One `<h1>` (portfolio name). Toggles/pills are real `<button>`s with `aria-pressed`/`aria-current`.
- Visible focus rings; color is never the only signal (always paired with text).
- Verify light **and** dark; no hardcoded colors — tokens only.
- Respect `prefers-reduced-motion` (disable card mount/press motion).
