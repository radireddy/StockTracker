-- Add market_cap column to indian_stocks (populated from Yahoo Finance)
ALTER TABLE indian_stocks ADD COLUMN IF NOT EXISTS market_cap NUMERIC;
