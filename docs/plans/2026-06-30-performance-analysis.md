# StockTracker — Schema, Features & Performance Analysis

## Context
Analysis of the full StockTracker codebase to understand the database schema, feature set, and identify actionable performance improvements.

---

## Schema Summary (15 tables, 14 migrations)

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `profiles` | User auth/plan info | PK on id |
| `portfolios` | Holdings/watchlist groups | Unique partial (user_id, is_default) |
| `companies` | Stocks in portfolios | (portfolio_id, isin) unique; user_id, isin indexes |
| `indian_stocks` | Master stock catalog (shared) | GIN trigram on name; nse_symbol, bse_code unique partials |
| `transactions` | Immutable trade log | (company_id, date); (owner_id, trade_id) unique; GIN on trade_ids |
| `portfolio_owners` | Family members/demat accounts | (user_id, name) unique |
| `owner_holdings` | Cached FIFO holdings per owner | (company_id, owner_id) unique |
| `import_jobs` | Async import tracking | (user_id, status) |
| `projection_models` | PE-Earnings / EV-EBITDA models | (company_id, projection_type) unique |
| `financial_years` | Multi-year financial projections (20+ fields) | (projection_model_id, year) unique |
| `valuation_scenarios` | Bull/Base/Bare valuations | (projection_model_id, scenario_type) unique |
| `timeline_entries` | Quarterly event notes | company_id |
| `segment_valuations` | SOTP analysis | company_id |
| `market_perceptions` | Market vs own view | company_id |
| `corporate_actions` | **UNUSED** — feature removed, table remains | isin, status |

**RLS**: All user-scoped tables enforce `auth.uid() = user_id`. `indian_stocks` is shared read-only.

---

## Features Supported

### Core
- **Dashboard** — Dense data table with 18+ sortable columns, filtering (stars, strategy, buy signals), per-owner filtering, inline highlights expansion
- **Portfolio Management** — CRUD, reorder, default toggle, holdings vs watchlist types
- **Company Detail** — Tabbed view: Edit, Projections & Valuations, Transactions, Thesis (Tiptap rich text), Timeline
- **Multi-Model Valuations** — PE-Earnings and EV-EBITDA projection types with bull/base/bare scenarios
- **FIFO Holdings** — Per-owner FIFO computation, aggregated to company level
- **Portfolio Owners** — Family member management, every transaction tagged with owner

### Import & Pricing
- **Zerodha Import** — Broker adapter pattern, idempotent via (owner_id, trade_id), multi-file upload with progress
- **Price Refresh** — Yahoo Finance provider, auto-refresh on stale dashboard (5min), manual refresh action
- **Auto-Stock Creation** — Missing ISINs auto-created during import

### Calculations (App Layer)
- MoS (Margin of Safety), IRR/CAGR, PEG, Buy Signal detection, P&L per company & portfolio

---

## Performance Improvements Identified

### CRITICAL (noticeable impact now)

#### 1. `moveCompany()` — Sequential DB calls in loop
- **File**: `src/app/(authenticated)/actions/company-actions.ts` (lines ~131-343)
- **Problem**: Copies 6 related record types (projections, financials, valuations, timelines, segments, perceptions) with individual inserts in a loop — ~30+ sequential queries
- **Fix**: Batch each record type into a single `.insert([...array])` call — reduce to ~6 queries

#### 2. Dashboard API — 3 separate round-trips
- **File**: `src/app/api/dashboard/route.ts`
- **Problem**: 3 parallel but separate queries (companies, owners, holdings) + fires background price refresh on every stale request
- **Fix**: Combine using Supabase relationship queries; add Cache-Control headers; debounce price refresh (e.g., per-user cooldown)

#### 3. `CompaniesTable` — No React.memo, expensive per-row calculations
- **File**: `src/components/dashboard/companies-table.tsx` (790 lines)
- **Problem**: No `React.memo` wrapper; calculations like `computeLiveIrr()`, `marginOfSafety()` called per-row on every render; `highlightsLoading` state change re-renders entire table
- **Fix**: Wrap in `React.memo`; memoize row-level calculations; isolate highlights loading state

### HIGH (will matter at scale)

#### 4. Import Engine — Sequential transaction inserts
- **File**: `src/lib/import/import-engine.ts` (lines ~220-264)
- **Problem**: Inserts trades one-by-one in a loop
- **Fix**: Collect all transactions, batch insert with single `.insert([...])` call

#### 5. `recomputeHoldings()` — Per-owner upsert loop
- **File**: `src/lib/holdings.ts` (lines ~111-123)
- **Problem**: Calls `.upsert()` once per owner in loop
- **Fix**: Batch all owner_holdings into single `.upsert([...])` call

#### 6. Company Detail — Eager-loads all tab data
- **File**: `src/app/(authenticated)/company/[id]/page.tsx`
- **Problem**: Single query fetches financials, valuations, timelines, segments, perceptions even if user only views one tab
- **Fix**: Lazy-load tab content on tab switch (especially Thesis/Timeline which use rich text)

### MEDIUM (quality of life)

#### 7. Missing `useCallback` on event handlers
- **Files**: `companies-table.tsx` (toggleHighlights, sort handlers), `PortfolioPnlBar`
- **Fix**: Wrap handlers in `useCallback`; memoize PnL calculations in `useMemo`

#### 8. No Suspense boundaries or skeleton UI
- **Problem**: Dashboard shows "Loading companies..." text; no streaming
- **Fix**: Add Suspense boundaries with skeleton components for progressive rendering

#### 9. Next.js config missing optimizations
- **File**: `next.config.ts`
- **Fix**: Add `experimental.optimizePackageImports` for large deps (recharts, tiptap, xlsx)

#### 10. Dynamic imports for heavy libraries
- **Problem**: Tiptap (~200KB), xlsx, recharts loaded eagerly
- **Fix**: `next/dynamic` for Tiptap editor and import page components

### LOW (cleanup)

#### 11. Missing database indexes
- Add `(user_id, company_id)` composite on `owner_holdings` for dashboard queries
- Add `user_id` index on `financial_years`, `valuation_scenarios`, `timeline_entries` for bulk user operations
- Drop unused `corporate_actions` table

#### 12. Stale denormalized fields
- `companies.quantity`, `companies.avg_buy_price`, `companies.buy_date` are legacy — source of truth is `owner_holdings`
- Risk of stale data if `recomputeHoldings()` fails silently

---

## Verification

After implementing changes:
1. Run `npm run build` — ensure no type errors
2. Test dashboard load with 30+ companies — verify render performance
3. Test import flow with multi-file Zerodha upload — verify batch inserts
4. Test moveCompany — verify all related records copy correctly
5. Test company detail tabs — verify lazy-load doesn't break data
6. Browser DevTools Performance tab — confirm reduced re-renders on dashboard
