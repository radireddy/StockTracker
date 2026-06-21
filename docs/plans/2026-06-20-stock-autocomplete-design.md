# Stock Autocomplete & Schema Normalization Design

**Date:** 2026-06-20
**Status:** Approved

## Summary

Replace free-text company name/symbol entry with autocomplete from a master `indian_stocks` table seeded from NSE/BSE CSV data. Normalize the `companies` table to remove duplicate stock metadata. Merge `stock_prices` into `indian_stocks`.

## Goals

1. Only allow adding companies that exist in NSE/BSE listings
2. Single source of truth for stock metadata (name, symbol, sector)
3. Single source of truth for live prices (no separate `stock_prices` table)
4. Fast autocomplete search by name, NSE symbol, or BSE code

## Database Schema

### New table: `indian_stocks`

```sql
CREATE TABLE indian_stocks (
  isin TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nse_symbol TEXT,
  bse_code TEXT,
  sector TEXT,
  industry TEXT,
  series TEXT,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE', 'BOTH')),
  -- Live price fields (populated by cron for tracked stocks only)
  price NUMERIC,
  change NUMERIC,
  change_pct NUMERIC,
  volume BIGINT,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Indexes

- `UNIQUE idx_indian_stocks_nse_symbol ON (nse_symbol) WHERE nse_symbol IS NOT NULL` — fast lookup by NSE ticker
- `UNIQUE idx_indian_stocks_bse_code ON (bse_code) WHERE bse_code IS NOT NULL` — fast lookup by BSE code
- `GIN idx_indian_stocks_name_trgm ON (name gin_trgm_ops)` — fuzzy text search on company name
- `idx_indian_stocks_sector ON (sector)` — filter by sector
- `idx_indian_stocks_last_updated ON (last_updated) WHERE last_updated IS NOT NULL` — cron queries

### RLS

- Readable by all authenticated users
- Writable only by service role (cron/admin)

### Modified `companies` table

**Remove columns:** `name`, `symbol`, `sector`, `market_cap`, `current_price`

**Add column:** `isin TEXT NOT NULL REFERENCES indian_stocks(isin)`

Company metadata (name, symbol, sector) and live price data (price, market_cap) are now resolved via JOIN on `isin`.

### Drop table: `stock_prices`

Fully replaced by price columns on `indian_stocks`.

## Data Seeding

### Source Files

- NSE: Equity listing CSV (~2,400 companies) — symbol, name, series, ISIN, sector/industry
- BSE: Listed securities CSV (~5,000 companies) — BSE code, name, ISIN, sector/industry

### Merge Strategy

- Parse both CSVs, merge on ISIN
- If ISIN in both: `exchange = 'BOTH'`, populate `nse_symbol` + `bse_code`
- If only NSE: `exchange = 'NSE'`, `bse_code = NULL`
- If only BSE: `exchange = 'BSE'`, `nse_symbol = NULL`
- Store merged data as `supabase/seed/indian_stocks.csv`
- Migration bulk-inserts via upsert on ISIN
- Reseedable — re-run when new CSVs are downloaded

## Cron Refresh Changes

- Read tracked symbols from `companies` JOIN `indian_stocks` on `isin`
- Prefer `nse_symbol` (append `.NS` for Yahoo Finance), fall back to `bse_code` (append `.BO`)
- Upsert price columns directly on `indian_stocks`
- Same trading hours guard (Mon-Fri 9am-4pm IST)

## Autocomplete Component

### `StockSearch` Component

- Built on shadcn `Command` (cmdk-based combobox)
- Searches `indian_stocks` by name, nse_symbol, or bse_code
- Debounced input (300ms), queries via server action
- Result format: "Reliance Industries (NSE: RELIANCE / BSE: 500325)"
- On select: sets `isin` on form, displays selected stock as chip/badge
- User can clear and re-search

### Company Form Changes

- **Remove fields:** name, symbol, sector, market_cap, current_price
- **Replace with:** Stock search autocomplete (required)
- **Keep:** buy_price, star_rating, strategy, investment_horizon_years, expected_returns, thesis, highlights

### Edit Company Dialog

- Stock selection is read-only after creation (shows stock name + symbols)
- Other fields remain editable

### Display Changes

- Dashboard, company header: name, symbol, sector, price resolved via JOIN to `indian_stocks`
- All queries updated to join `companies` with `indian_stocks` on `isin`

## Migration Strategy

### Steps

1. Create `indian_stocks` table with indexes and RLS
2. Seed `indian_stocks` from merged CSV data
3. Add `isin` column to `companies` (nullable initially)
4. Backfill `isin` — match `companies.symbol` to `indian_stocks.nse_symbol`, fall back to name match
5. Make `isin` NOT NULL after backfill
6. Drop columns from `companies`: `name`, `symbol`, `sector`, `market_cap`, `current_price`
7. Drop `stock_prices` table
8. Update all queries, server actions, and components

### Risks & Mitigations

- **Backfill mismatches:** Migration logs unmatched rows for manual resolution
- **Data safety:** Old columns dropped only after backfill succeeds
- **Rollback:** Migration is reversible — columns can be re-added from `indian_stocks` JOIN if needed
