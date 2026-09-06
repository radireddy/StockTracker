# Corporate Actions & Stable Security Identity — Design Spec

**Date:** 2026-09-05
**Status:** Approved design, pending implementation plan
**Scope:** Trades dashboard / FIFO open-position tracking

## Problem

FIFO matching (`computeFifoMatches`) groups trades by raw `isin`. Two upstream
realities break this and leave **phantom open positions** — fully-exited
holdings that still show as unsold:

1. **ISIN change (corporate action).** A split/bonus can change a security's
   ISIN. Buys land under the old ISIN, sells under the new one, so FIFO never
   matches them. The stock master is *forked* into two `indian_stocks` rows with
   different surrogate `id`s (the old row typically has `name = null`).
   Confirmed cases (account XD6134): JSLL, SDBL, AVL, SENCO.
2. **Quantity change (split/bonus).** Even once identity is unified, a pre-split
   buy of N shares cannot net against a post-split sell of N×factor shares.
   Confirmed: JSLL — 270 pre-split shares (old ISIN) vs 1,350 post-split sells
   (new ISIN) = a clean **1:5 split** (270 × 5 = 1,350).

A separate, already-fixed cause (blank ISIN on BSE trades) is **out of scope**
here; it was resolved by symbol-based backfill in the parser.

## Goals

- FIFO establishes a **stable security identity** across ISIN/symbol changes.
- Pre-corporate-action quantities/prices are normalized to current units so
  buys and sells reconcile across splits/bonuses.
- `trades` remain **immutable**; all adjustment happens at compute time.
- Dashboard open-position reads stay **fast** (no shipping raw trades, no hairy
  CA-aware SQL).

## Non-goals (deferred)

- Mergers, demergers, spin-offs (basis allocation across multiple securities).
- Auto-detection of corporate actions (data is entered manually/seeded).
- Strict per-tax bonus treatment (zero-cost lot at allotment date) — see
  "Bonus simplification" below.
- Realized-gains / capital-gains tax reporting.

## Design decisions (confirmed)

1. **Identity unification** = supersession pointer on `indian_stocks`
   (reuses the existing surrogate `id`; non-destructive, reversible).
2. **Corporate-action facts** = a manual/seeded `corporate_actions` table
   (global reference data, like `indian_stocks`).
3. **Action types in v1** = `split` and `bonus`; ISIN/symbol change handled by
   the identity pointer. Mergers/demergers designed-around but not implemented.
4. **Adjustment** = compute-time factors; trades immutable.

## Schema changes — migration `006_corporate_actions.sql`

### 1. Supersession pointer

```sql
ALTER TABLE indian_stocks
  ADD COLUMN canonical_stock_id UUID REFERENCES indian_stocks(id);

CREATE INDEX idx_indian_stocks_canonical
  ON indian_stocks (canonical_stock_id)
  WHERE canonical_stock_id IS NOT NULL;
```

- `NULL` = the row is itself canonical (the common case).
- A forked *old* row sets `canonical_stock_id` = the *new* (canonical) row's `id`.
- **Effective identity** = `COALESCE(canonical_stock_id, id)`.
- **One level only** (no chains). Enforced by a trigger/check: a row referenced
  as a `canonical_stock_id` must itself have `canonical_stock_id IS NULL`.
- Global reference data (no `user_id`).

### 2. `corporate_actions` (global, seeded)

```sql
CREATE TABLE corporate_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id    UUID NOT NULL REFERENCES indian_stocks(id),  -- canonical security
  action_type TEXT NOT NULL CHECK (action_type IN ('split','bonus')),
  ex_date     DATE NOT NULL,
  factor      NUMERIC(20,8) NOT NULL CHECK (factor > 0),   -- share multiplier
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (stock_id, action_type, ex_date)
);
```

- `factor` = share multiplier: 1:5 split → `5`; 1:1 bonus → `2` (shares double).
- Applied to any trade dated **before** `ex_date`:
  `adj_qty = qty × factor`, `adj_price = price / factor`.
  Cost (`qty × price`) and acquisition date are preserved.
- `stock_id` references the **canonical** security (post-unification).

### 3. `open_position_snapshots` (per-account aggregated result)

```sql
CREATE TABLE open_position_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stock_id      UUID REFERENCES indian_stocks(id),   -- canonical
  isin          TEXT,                                 -- canonical isin (cache)
  symbol        TEXT,
  quantity      NUMERIC(20,4) NOT NULL,               -- current units
  avg_buy_price NUMERIC(20,6) NOT NULL,               -- adjusted cost basis
  computed_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, stock_id)
);

ALTER TABLE open_position_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own open_position_snapshots"
  ON open_position_snapshots FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_open_pos_snap_account ON open_position_snapshots (account_id);
```

- Written by `recomputeFifoForAccount` (same trigger points as
  `trade_lot_matches`): delete-for-account → insert current rows.
- Stores **static** FIFO output (quantity in current units, adjusted avg cost).
  Live price / unrealized P&L are joined from `indian_stocks.price` at read time.
- Retires the `get_open_positions` RPC — reads become a trivial snapshot select.

## Compute changes

### New pure module `src/lib/import/corporate-actions.ts`

- `resolveCanonical(stockId, canonicalMap): string` — `COALESCE`-style lookup.
- `cumulativeFactor(tradeDate, actions): number` — product of `factor` for all
  actions on that security with `ex_date > tradeDate`.
- `adjustTrade(trade, actions): { adj_qty, adj_price }` — apply cumulative factor.

Pure, no DB — unit-testable in isolation.

### FIFO engine (`fifo-engine.ts`)

- Group by **canonical security_id** instead of raw `isin`.
- Match on **adjusted** units (`adj_qty` / `adj_price`).
- `trade_lot_matches.matched_quantity` and derived open lots are therefore in
  **current units**, consistent with what the broker/holdings show today.

### Data loading (`tradebook-import-engine.ts`, `trades-actions.ts`)

- When loading trades for FIFO, also load the `canonical_stock_id` map and the
  relevant `corporate_actions`, and pass them to the normalization step before
  matching.
- `recomputeFifoForAccount` additionally rebuilds `open_position_snapshots` for
  the account (delete → insert), in the same delete/insert transaction shape as
  `trade_lot_matches`.

### Reads (`trades-actions.ts`)

- `getOpenPositions` reads `open_position_snapshots` for the account(s) and joins
  `indian_stocks` for live `price`, `name`, `sector` → computes unrealized P&L in
  the action. (Replaces the `get_open_positions` RPC.)
- `getOpenLotsForStock` (already JS, per-stock) applies the same CA normalization
  and resolves by canonical id.

## Migration & backfill

1. **`006_corporate_actions.sql`** — add `canonical_stock_id`; create
   `corporate_actions` and `open_position_snapshots` (+ RLS, indexes, one-level
   check). Applied by hand in the Supabase Dashboard (project convention).
2. **`scripts/backfill-corporate-actions.ts`** (dry-run default, `--apply`):
   - Set `canonical_stock_id` on the forked old rows → their new canonical rows
     (JSLL, SDBL, AVL, SENCO).
   - Seed `corporate_actions` factors from **verified** public records
     (JSLL confirmed 1:5 from the data; SDBL/AVL/SENCO ratios verified against
     public corporate-action records + cross-checked against the old-vs-new
     quantity ratio during implementation).
   - Recompute FIFO + snapshots for affected accounts.
   - Verify JSLL/SDBL/AVL/SENCO phantom positions clear (net → 0 or expected).

## Bonus simplification (conscious tradeoff)

Strict Indian tax treats bonus shares as a **separate zero-cost lot dated at
allotment**. v1 models a bonus as a quantity **multiplier** (shares × factor,
cost spread → blended avg). This yields the correct **current quantity** and a
reasonable blended cost for open-position display, which is what the dashboard
needs. The strict zero-cost-lot treatment is deferred to realized-gains/tax
reporting. Documented so it is a deliberate choice, not an oversight.

## Testing (TDD)

- `corporate-actions.ts`: factor applied to pre-ex-date trade, not post; product
  of multiple actions; canonical resolution incl. the no-op (canonical) case.
- `fifo-engine.ts`: pre-split buy ↔ post-split sell nets to zero (JSLL 1:5);
  ISIN-change buy↔sell matches via canonical id; a normal single-ISIN book is
  unchanged (regression guard).
- Engine/reads: `recomputeFifoForAccount` writes `open_position_snapshots`;
  `getOpenPositions` reflects adjusted quantities.
- End-to-end verify against XD6134 after backfill.

## Risks / open items

- **Seed accuracy.** Wrong `factor` or `ex_date` produces wrong adjustments.
  Mitigated by dry-run + post-backfill reconciliation against holdings.
- **RPC retirement.** Ensure no other caller depends on `get_open_positions`
  before removing it.
- **One-level canonical chains.** If a security changes ISIN twice, the pointer
  must be re-pointed to the newest canonical (not chained). Enforced by check +
  handled in the backfill script.
