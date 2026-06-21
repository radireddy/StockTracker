-- Shared market price table (one row per symbol, not per user)
CREATE TABLE stock_prices (
  symbol TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  change NUMERIC DEFAULT 0,
  change_pct NUMERIC DEFAULT 0,
  volume BIGINT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Public market data, readable by all authenticated users
ALTER TABLE stock_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read stock prices"
  ON stock_prices FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (cron) can write — no INSERT/UPDATE policy for authenticated
