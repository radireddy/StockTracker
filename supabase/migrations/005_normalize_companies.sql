-- Normalize companies table: enforce isin FK and drop redundant columns.
-- Prerequisites:
--   1. indian_stocks table is seeded (npm run seed:stocks)
--   2. All companies have a valid isin (run scripts/backfill-company-isin.ts)

-- Make isin NOT NULL now that all rows are backfilled
ALTER TABLE companies ALTER COLUMN isin SET NOT NULL;

-- Drop columns that are now sourced from indian_stocks
ALTER TABLE companies
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS symbol,
  DROP COLUMN IF EXISTS sector,
  DROP COLUMN IF EXISTS market_cap,
  DROP COLUMN IF EXISTS current_price;

-- Drop legacy stock_prices table (superseded by indian_stocks price columns)
DROP POLICY IF EXISTS "Authenticated users can read stock prices" ON stock_prices;
DROP TABLE IF EXISTS stock_prices;
