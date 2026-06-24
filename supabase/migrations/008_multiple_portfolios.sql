-- Add portfolio type, ordering, and visual customization columns
ALTER TABLE portfolios
  ADD COLUMN type TEXT NOT NULL DEFAULT 'holdings'
    CHECK (type IN ('holdings', 'watchlist')),
  ADD COLUMN sort_order INTEGER DEFAULT 0,
  ADD COLUMN color TEXT,
  ADD COLUMN icon TEXT;

-- Ensure only one default portfolio per user (partial unique index)
CREATE UNIQUE INDEX idx_portfolios_user_default
  ON portfolios (user_id) WHERE is_default = true;
