-- Enable pg_trgm extension for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Master catalog of Indian stocks (NSE + BSE)
CREATE TABLE indian_stocks (
  isin TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nse_symbol TEXT,
  bse_code TEXT,
  sector TEXT,
  industry TEXT,
  series TEXT,
  exchange TEXT NOT NULL CHECK (exchange IN ('NSE', 'BSE', 'BOTH')),
  price NUMERIC,
  change NUMERIC,
  change_pct NUMERIC,
  volume BIGINT,
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique partial indexes on nse_symbol and bse_code (allow multiple NULLs/empty)
CREATE UNIQUE INDEX idx_indian_stocks_nse_symbol
  ON indian_stocks (nse_symbol)
  WHERE nse_symbol IS NOT NULL AND nse_symbol != '';

CREATE UNIQUE INDEX idx_indian_stocks_bse_code
  ON indian_stocks (bse_code)
  WHERE bse_code IS NOT NULL AND bse_code != '';

-- GIN trigram index on name for fuzzy / ILIKE search
CREATE INDEX idx_indian_stocks_name_trgm
  ON indian_stocks USING gin (name gin_trgm_ops);

-- B-tree index on sector for filtering
CREATE INDEX idx_indian_stocks_sector
  ON indian_stocks (sector);

-- B-tree index on last_updated for freshness queries
CREATE INDEX idx_indian_stocks_last_updated
  ON indian_stocks (last_updated)
  WHERE last_updated IS NOT NULL;

-- RLS: readable by authenticated users, writable only by service role
ALTER TABLE indian_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read indian stocks"
  ON indian_stocks FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy — only service role can write

-- Add ISIN foreign key to companies table (nullable for now)
ALTER TABLE companies
  ADD COLUMN isin TEXT REFERENCES indian_stocks(isin);

CREATE INDEX idx_companies_isin
  ON companies (isin);
