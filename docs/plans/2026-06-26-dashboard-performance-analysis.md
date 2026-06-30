# Dashboard Performance Optimization — Deep Analysis

## Context

Deep research and analysis of all approaches to improve StockTracker dashboard performance, including how broker platforms like Zerodha achieve fast holdings pages.

---

## Current Dashboard Architecture

### Query Structure (getDashboardData in company-actions.ts)

```
companies (8 scalar fields)
  → LEFT JOIN indian_stocks (4 fields) — via isin FK, 1:1
  → LEFT JOIN projection_models (1 field: is_default) — via company_id FK, 1:many
    → LEFT JOIN valuation_scenarios (4 fields) — via projection_model_id FK, 1:many (3 per model)
```

Plus parallel queries: `portfolio_owners` (always), `owner_holdings` (conditional, sequential after companies).

### Separate Live Prices Mechanism

`getLivePrices()` polls every 5 min via client hook → queries `companies` + `indian_stocks` again (duplicate of what dashboard already fetches).

### Current Scale

- ~31-50 companies per user, 1-2 projection models each, 3 scenarios per model
- ~5,500 indian_stocks rows (shared catalog)
- ~155 owner_holdings rows max (31 companies x 5 owners)
- No caching at any layer (no React Query, no SWR, no unstable_cache)
- Dashboard is a client component — shows "Loading..." spinner, then fetches via useEffect

---

## How Zerodha & Broker Platforms Are Fast

| Pattern | What Brokers Do | StockTracker Current State |
|---------|----------------|--------------------------|
| **Pre-computed snapshots** | Holdings computed at T+1 settlement, stored as flat materialized rows | FIFO computed on transaction change, cached in `owner_holdings` + `companies.quantity/avg_buy_price` (already doing this) |
| **CQRS** | Separate write path (order execution) from read path (portfolio view) | Single path — same tables for read and write |
| **Zero-JOIN reads** | `SELECT * FROM holdings_snapshot WHERE user_id = ?` — one table, one index scan | 3 LEFT JOINs across 4 tables |
| **In-memory price layer** | Redis/memory for prices, pushed via WebSocket | DB query every 5 min via polling |
| **Event-driven updates** | Only affected rows updated incrementally | Already incremental via `recomputeHoldings(companyId)` |
| **Flat denormalized table** | All display fields pre-joined: name, symbol, qty, avg_price, current_price, pnl | Nested JSON from PostgREST, normalized in app layer |

**Key insight:** Brokers can afford zero-JOIN reads because they have millions of users. StockTracker has 31-50 companies per user — the JOINs are effectively free at this scale. The real bottleneck is **network round-trips**, not query execution.

---

## 7 Approaches Analyzed

### Approach 1: Client-Side Caching with React Query ★★★ RECOMMENDED

**What:** Replace manual `useState` + `useEffect` fetching with React Query (TanStack Query). Cache dashboard data with `staleTime: 30-60s`. Wrap `getLivePrices()` with `refetchInterval: 5min`.

**Broker pattern:** Client-side cache — holdings don't re-fetch on tab switch/navigation.

**Impact:**
- Eliminates re-fetch on navigation back to dashboard (cache hit = 0ms)
- Deduplicates identical in-flight requests automatically
- Stale-while-revalidate: shows cached data instantly, refreshes in background

**Complexity:** Low (single dependency, ~13KB gzipped). Existing `getDashboardData` is already a clean pure function.

**Trade-offs:** Must invalidate cache on mutations (`createCompany`, `deleteCompany`, etc). React Query's `invalidateQueries` handles this.

**Verdict:** **Highest ROI change.** Every professional React app uses a query cache layer. Fixes the most common real-world latency: unnecessary re-fetches.

---

### Approach 2: Merge Live Prices into Dashboard Query ★★★ RECOMMENDED

**What:** Remove the separate `getLivePrices()` polling mechanism. Dashboard query already fetches `indian_stocks(price, market_cap)`. The two queries hit the same table. Move the staleness-trigger logic into `getDashboardData`.

**Broker pattern:** Don't query the same data source twice.

**Impact:**
- Eliminates 1 round-trip per page load + 1 per 5-min poll interval
- With React Query: dashboard query gets `refetchInterval: 5min` and serves both purposes

**Complexity:** Low. Remove `useLivePrices` hook, remove `LivePricesProvider`, pass prices from dashboard data.

**Trade-offs:** Company detail page also uses `useLivePricesContext()` — needs alternative (React Query shared cache key, or pass prices from dashboard cache).

**Verdict:** **Clear waste elimination.** Querying the same table twice is objectively redundant.

---

### Approach 3: Pre-Fetch All Owner Holdings in Parallel ★★★ RECOMMENDED

**What:** Currently `owner_holdings` is fetched sequentially after companies query (needs `companyIds`). Instead, always fetch ALL owner_holdings in parallel:

```typescript
const [companies, owners, allHoldings] = await Promise.all([
  companyQuery,
  ownersQuery,
  supabase.from("owner_holdings").select("company_id, owner_id, quantity, avg_buy_price, buy_date")
]);
// Filter client-side by ownerFilter
```

At most ~155 rows (31 companies x 5 owners), trivially small.

**Broker pattern:** "Fetch once, filter client-side."

**Impact:** Eliminates the sequential 3rd query waterfall. Saves 100-300ms on owner-filtered views.

**Complexity:** Very low. ~3 lines changed in `getDashboardData`.

**Trade-offs:** Slightly larger payload when filter is "all" (~2KB extra). Negligible.

**Verdict:** **Easiest win.** 3 lines of code, eliminates a waterfall, zero downsides at this scale.

---

### Approach 4: Convert Dashboard to Server Component with Streaming ★★ MAYBE LATER

**What:** Currently `page.tsx` is `"use client"` → shows "Loading..." → fetches in useEffect → renders. Convert to server component: server fetches data at request time, sends pre-rendered HTML. Table appears instantly on first paint.

**Broker pattern:** Not a broker pattern — they use native apps. This is the web equivalent (SSR = instant first paint).

**Impact:** Eliminates "Loading companies..." spinner. Time to First Meaningful Paint improves significantly. Queries execute server-side (Vercel → Supabase: ~5-20ms vs browser → Supabase: ~100-300ms).

**Complexity:** Medium. Owner filter state management changes. Portfolio switching needs URL params or different pattern.

**Trade-offs:** Refactor of page.tsx. Can also be solved more cheaply with React Query's `placeholderData`.

**Verdict:** **Good but not urgent.** React Query (Approach 1) handles this more cheaply with cached data as placeholder.

---

### Approach 5: Postgres VIEW for Dashboard Data ★ NOT YET

**What:** Create a VIEW that pre-joins companies + indian_stocks + default model's base/bare scenarios into flat rows:

```sql
CREATE VIEW dashboard_companies_v AS
SELECT c.id, c.isin, ..., s.name, s.price, s.market_cap,
  base.target_market_cap AS base_target_mcap, base.irr AS base_irr,
  bare.target_market_cap AS bare_target_mcap, bare.irr AS bare_irr
FROM companies c
LEFT JOIN indian_stocks s ON s.isin = c.isin
LEFT JOIN projection_models pm ON pm.company_id = c.id AND pm.is_default = true
LEFT JOIN valuation_scenarios base ON base.projection_model_id = pm.id AND base.scenario_type = 'base'
LEFT JOIN valuation_scenarios bare ON bare.projection_model_id = pm.id AND bare.scenario_type = 'bare';
```

**Broker pattern:** Pre-computed flat read model.

**Impact:** Eliminates PostgREST nested JSON assembly overhead. Returns flat rows. 10-30% faster query.

**Complexity:** Low-Medium. One migration + one code change. But RLS with Supabase VIEWs requires careful handling.

**Trade-offs:** Schema coupling — VIEW must be updated when underlying tables change. PostgREST/RLS interplay.

**Verdict:** **Not worth it at 31-50 rows.** PostgREST nested embed overhead is negligible at this scale.

---

### Approach 6: Denormalize Scenario Data onto Companies Table ★ NOT YET

**What:** Add `base_target_mcap`, `base_irr`, `bare_target_mcap`, `bare_irr` columns directly to `companies`. Update via trigger or app-layer sync when scenarios change. Dashboard becomes `companies + indian_stocks` (1 JOIN).

**Broker pattern:** **Pre-computed denormalized snapshot** (Zerodha's core pattern).

**Impact:** Eliminates 2 JOINs (projection_models + valuation_scenarios).

**Complexity:** Medium. Migration + trigger/sync logic + backfill.

**Trade-offs:** Consistency risk (stale denormalized data). Breaks clean normalization. Sync complexity outweighs near-zero gain at this scale.

**Verdict:** **Over-engineering.** At 31 companies with 93 scenario rows, the JOIN is free. Makes sense at 10,000+ companies.

---

### Approach 7: WebSocket for Live Prices ★ NOT YET

**What:** Replace 5-min `setInterval` polling with Supabase Realtime subscription to `indian_stocks` table changes.

**Broker pattern:** **In-memory price layer with push** (Zerodha's WebSocket streaming).

**Impact:** Eliminates all polling queries. Prices update within seconds of refresh.

**Complexity:** Medium. Realtime setup + subscription management + reconnection handling.

**Trade-offs:** Supabase Realtime free tier has 200 connection limit. Bulk price refresh generates ~5,500 change events. Marginal benefit for a fundamental analysis tool (not a trading app).

**Verdict:** **Not needed.** 5-minute polling is appropriate for fundamental analysis. Worth revisiting only for intraday features.

---

## Recommended Implementation Plan

### Priority 1: Pre-fetch all owner holdings (Approach 3)

- **File:** `src/app/(authenticated)/actions/company-actions.ts`
- **Change:** Fetch `owner_holdings` in parallel with companies and owners (always, not conditionally)
- **Filter by owner client-side** in `getDashboardData` before returning
- **Effort:** 30 minutes

### Priority 2: Merge live prices into dashboard (Approach 2)

- **Files:**
  - `src/app/(authenticated)/actions/company-actions.ts` — add staleness-trigger to `getDashboardData`
  - `src/hooks/use-live-prices.ts` — remove or repurpose
  - `src/components/auto-refresh.tsx` — remove `LivePricesProvider` or simplify
  - `src/components/dashboard/companies-table.tsx` — get prices from dashboard data instead of context
  - `src/components/dashboard/portfolio-pnl-bar.tsx` — same
  - `src/components/company/company-header.tsx` — needs alternative price source
- **Effort:** 1-2 hours

### Priority 3: Client-side caching with React Query (Approach 1)

- **Files:**
  - `package.json` — add `@tanstack/react-query`
  - `src/components/authenticated-shell.tsx` — wrap with `QueryClientProvider`
  - `src/app/(authenticated)/page.tsx` — replace `useEffect` with `useQuery`
  - All mutation call sites — add `invalidateQueries` calls
- **Effort:** 2-4 hours

---

## Performance Summary

| Metric | Current | After Priority 1-3 |
|--------|---------|-------------------|
| DB queries per dashboard load | 2-3 (with waterfall) | 1 parallel batch (3 queries, no waterfall) |
| Separate price poll query | 1 every 5 min | 0 (merged into dashboard) |
| Re-fetch on navigation back | Full re-fetch | Cache hit (0ms), background revalidate |
| Owner filter change | Sequential 3rd query | Client-side filter (instant) |
| Estimated total latency | 300-800ms | 100-300ms (first visit), ~0ms (cached) |

---

## Verification

1. `npm run build` — no type errors
2. Dashboard loads with correct data (companies, prices, scenarios)
3. Owner filter works (client-side filtering from pre-fetched data)
4. Prices update every 5 minutes (via React Query refetchInterval)
5. Navigate to company detail and back — dashboard shows cached data instantly
6. Create/edit/delete company — dashboard cache invalidated, fresh data shown
7. Company detail page still shows correct live prices
