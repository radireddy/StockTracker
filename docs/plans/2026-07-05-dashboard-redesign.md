# Dashboard Redesign — Implementation Plan

**Status:** ready to implement · **Scope:** dashboard only · **Date:** 2026-07-05
**Design reference:** `docs/mockups/` (open `dashboard-desktop.html` and `dashboard-mobile.html`).

## Context

The landing page was reworked and looks polished; the authenticated dashboard looks plain even though
it already uses the same design tokens (`src/app/globals.css`) and `ui/*` library. This is a
**design-language refresh + layout redesign of the dashboard** — apply the landing page's polish
(spacing, `rounded-xl` cards + hover, soft shadows, gradient page headers, color discipline, subtle
motion) and restructure the dashboard per the approved mockups. No data-model or server-action changes;
no new dependencies. Keep all computation utils; restyle presentation only.

Read `docs/mockups/README.md` first — it lists the locked decisions and the reuse contract.

## Non-negotiable requirements

- **Light and dark mode are both first-class.** Every new surface is built with theme tokens
  (no hardcoded colors) and **verified in both `:root` (light) and `.dark`**. Nothing ships styled for
  only one mode. The mockups already prove both modes with the real tokens — match that.
- **Both desktop and mobile are implemented.** The dashboard redesign covers *both* breakpoints — the
  `lg`+ desktop table/views **and** the `<lg` mobile card layout (incl. bottom nav, filter sheet, empty
  states). Neither is optional; verify both.
- **Add the polish to the theme, then reuse it — never inline per-page.** Any recurring token, utility,
  or pattern introduced here (soft shadow, gradient page-header glow, card + hover treatment, segmented
  control, pill, status colors, empty-state block) is defined **once** in the central theme layer
  (`src/app/globals.css` via `@theme`/`@layer`) and/or shared `ui/*` components, so **all current and
  future pages reuse the same primitives**. The dashboard is the first consumer; company detail,
  settings, import, forms, and auth adopt the *same* primitives in later passes with zero re-invention.

## Build order

### 1. Theme & shared primitives (do first)
- **Theme tokens/utilities — `src/app/globals.css`:** confirm the light `:root` and `.dark` token sets
  cover every color the redesign uses (add any missing ones to *both* blocks). Add reusable utilities for
  the new patterns so they are declared once, not per page: e.g. `--shadow-soft`/`shadow-soft`, a
  `page-header` gradient-glow helper, card + `hover:border-primary/40`, segmented, pill, and the
  status colors (under/in-range/over, profit/loss). Everything must resolve correctly in light **and** dark.
- **Shared components — `src/components/ui/`:** extend or add `Segmented`, `Pill`, and an `EmptyState`
  block so the dashboard (desktop + mobile) and later pages reuse them. Verify each in both themes.
- Add `src/lib/utils/portfolios.ts` with `firstOfType(portfolios, type)` (move the inline copy from
  `src/components/layout/mobile-bottom-nav.tsx` and reuse it there).
- Add tiny helpers: `initials(name)`.

### 2. Portfolio navigation — `src/components/portfolio/portfolio-nav.tsx` (new)
- Desktop control using `usePortfolioContext()` (`portfolios`, `selectedId`, `select`, `selectedPortfolio`).
- `Portfolios | Watchlists` segmented toggle; switching type → `select(firstOfType(portfolios, type))`.
- Pill row of portfolios of the active type (lift the `sameType.map` pill markup from
  `mobile-dashboard.tsx:195-220`; active = `bg-primary text-primary-foreground`, show `company_count`).
- Trailing `+ New` pill → opens existing `CreatePortfolioDialog`; small `Manage` link → `/settings`.
- Remove the dashboard-only `PortfolioDropdown` from `src/components/layout/app-header.tsx`.

### 3. Dashboard page — `src/app/(authenticated)/dashboard/page.tsx`
- Replace the plain header with a **gradient page header**: eyebrow (`Portfolio`/`Rebalance`/`Research`),
  bold title (portfolio name + count), muted subtitle, `+ Add company` primary button.
- Render `<PortfolioNav/>` under the header. Keep data flow (`useDashboardData`, `consolidateHoldings`,
  `accountFilter`) and the `isHoldings` gating.

### 4. Summary hero — `src/components/dashboard/portfolio-pnl-bar.tsx`
- Redesign the flat strip into a **hero card**: big `Current value` (mono, tracking-tight), all-time
  **P&L pill**, footer row = **Invested / Companies / Accounts**. **No Today, no XIRR.** Keep the math.

### 5. Allocation health — `src/components/dashboard/allocation-summary-bar.tsx`
- Restyle the per-star badges into a **card** with per-star bar (weight vs. target band + dashed band
  markers) + Under/In-Range/Over tag. Reuse the existing per-star aggregation. Optional rebalance nudge line.

### 6. CompaniesTable — `src/components/dashboard/companies-table.tsx`
Keep all state/logic (`ViewMode`, `allocationBasis`, sorting, filters, `getAllocationData`, `RangeBar`,
`EmptyState`, dialogs). Presentation refactor of both renderers + toolbar.
- **Toolbar:** `Portfolio | Allocation` and `Invested | Current` as `ui` segmented; search + the two
  `Select` filters as consistent pills; keep count.
- **Portfolio view (all columns kept):** company avatar + name + `nse_symbol` sub; strategy chip;
  conviction left stripe (`BORDER_COLORS`); color-coded P&L/MoS; refined uppercase header; hover;
  `rounded-xl` card container with `overflow-x-auto`. Columns unchanged (Qty, Avg Buy, CMP, Cost,
  Cur. Value, P&L %, P&L ₹, Target Buy, MoS%, Base, Bare, Actions).
- **Allocation view (star-grouped, all columns kept):** group rows by star (4★→1★). Each group header:
  stars, group weight %, target band (`min×count`–`max×count`), status tag, rebalance ₹ action, group
  `RangeBar`. Member rows keep: CMP, Target Buy, Inv %, Cur %, Target band, `RangeBar`, Status, Delta,
  MoS%. `Invested | Current` toggle drives `activePct`/`activeStatus`/`activeDelta` across groups+rows;
  keep hover tooltips. Status filter applies within groups; hide empty groups.

### 7. Mobile — `mobile-dashboard.tsx`, `company-card.tsx`, `mobile-bottom-nav.tsx`
- **Cards:** avatar + name + `symbol · stars · type`; P&L (compact) + %; divider; Qty/Avg/LTP; Buy/MoS/Base;
  allocation bar with target-band ticks + `NOW x% · TARGET a–b%`; conviction left stripe; press animation.
- **Hero:** total-value card with soft radial glow, P&L pill, gradient progress, Invested/Current (₹Cr).
- **Bottom nav:** `Holdings · Watchlist · Add · Portfolio` (+ user avatar). `Add`→`/company/new`,
  `Portfolio`→ create-portfolio dialog; both teal. Holdings/Watchlist switch via `firstOfType`.
- **Filter:** replace the search bar + sort button with one **"Search, sort & filter"** trigger opening a
  bottom `Sheet` containing **Search → Account (holdings only) → Sort by → Allocation/Buy-only → Done**.
  Move the account filter out of the header into this sheet. Trigger badge shows current sort + active dot.
- **Empty states:** dashed-border card, icon in soft teal circle, title, subtitle, actions —
  Holdings = "No holdings yet" (Import statement + Add company); Watchlist = "Your watchlist is empty"
  (Add company). Hide the hero + filter trigger when empty; keep pills.

## Accessibility & theming
One `<h1>`; toggles/pills as `<button>` with `aria-pressed`/`aria-current`; visible focus; color never the
sole signal; **light + dark both verified**; **tokens only — no hardcoded hex** (grep to confirm);
`prefers-reduced-motion` respected. New patterns must use the shared theme primitives, not inline copies.

## Verification
1. `npm run dev`; drive with Playwright. Screenshot **each state in both light and dark, at both
   breakpoints**: desktop Portfolio, Allocation (expand groups, flip Invested/Current), Watchlist;
   mobile Holdings/Watchlist, the expanded "Search, sort & filter" sheet, and both empty states.
   Compare to `docs/mockups/screenshots/`.
2. Toggle the theme on every screen — everything (incl. new primitives) restyles with no leftover
   light-only or dark-only colors. `grep` for hardcoded hex in changed files → none.
3. Confirm the new primitives live in the theme/`ui/*` and are reused (not re-declared per component).
4. Confirm no columns lost vs. the current app and no Today/XIRR added.
5. `npm run lint`, `npm run typecheck` clean.
6. `npm run test` — allocation/consolidation unit tests still pass (logic untouched).
7. `npm run build` succeeds.

## Out of scope (later passes, same language)
Company detail, Settings, Import, add/edit company form, login/auth.
