-- Add holding-specific fields to companies (nullable — unused for watchlists)
ALTER TABLE companies
  ADD COLUMN quantity NUMERIC,
  ADD COLUMN avg_buy_price NUMERIC,
  ADD COLUMN buy_date DATE,
  ADD COLUMN notes TEXT,
  ADD COLUMN sort_order INTEGER DEFAULT 0;

-- Prevent duplicate stock in same portfolio
CREATE UNIQUE INDEX idx_companies_portfolio_isin
  ON companies (portfolio_id, isin);
