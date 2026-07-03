-- ============================================================================
-- Holdings Redesign
--
-- Replaces the trade-import → FIFO → derived-holdings pipeline with direct
-- import of broker HOLDINGS statements.
--
--   accounts        : broker demat accounts (flat; replaces portfolio_owners)
--   holdings        : per-account per-company position snapshot (replaces owner_holdings)
--   import_holdings  : one row per statement import (replaces import_jobs)
--
-- Drops: transactions, owner_holdings, import_jobs, portfolio_owners,
--        corporate_actions, and companies.{quantity,avg_buy_price,buy_date}.
--
-- Company research/recommendation data (thesis, star, target buy, strategy,
-- valuations, financials, allocation ranges) is untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop the old trade/holdings pipeline
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS owner_holdings CASCADE;
DROP TABLE IF EXISTS import_jobs CASCADE;
DROP TABLE IF EXISTS corporate_actions CASCADE;   -- feature already removed from app
DROP TABLE IF EXISTS portfolio_owners CASCADE;

-- ----------------------------------------------------------------------------
-- 2. companies becomes research-only (positions live in `holdings`)
-- ----------------------------------------------------------------------------
ALTER TABLE companies DROP COLUMN IF EXISTS quantity;
ALTER TABLE companies DROP COLUMN IF EXISTS avg_buy_price;
ALTER TABLE companies DROP COLUMN IF EXISTS buy_date;

-- ----------------------------------------------------------------------------
-- 3. accounts — one row per broker demat account (user-scoped, shared across portfolios)
-- ----------------------------------------------------------------------------
CREATE TABLE accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,                     -- "Wife – Groww", user-editable, shown in filter chips
  broker     TEXT NOT NULL DEFAULT 'zerodha',   -- 'zerodha' | 'manual' | (future: 'groww', ...)
  client_id  TEXT,                              -- broker demat id (e.g. 'XD6134'); NULL for manual-only accounts
  pan_number TEXT,
  mobile     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, label)
);

-- Reimport-detection key: match an incoming statement to an existing account.
CREATE UNIQUE INDEX idx_accounts_user_broker_client
  ON accounts (user_id, broker, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_accounts_user ON accounts(user_id);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own accounts"
  ON accounts FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_accounts
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- 4. import_holdings — one row per statement import (synchronous; no polling)
-- ----------------------------------------------------------------------------
CREATE TABLE import_holdings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id    UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  broker          TEXT NOT NULL DEFAULT 'zerodha',
  client_id       TEXT,
  statement_date  DATE,                          -- parsed from "…as on 2025-03-31"
  file_name       TEXT,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','failed')),
  is_reimport     BOOLEAN DEFAULT false,
  companies_count INTEGER DEFAULT 0,
  imported_count  INTEGER DEFAULT 0,
  skipped_count   INTEGER DEFAULT 0,
  summary         JSONB DEFAULT '{}',
  errors          JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_holdings_user ON import_holdings(user_id);
CREATE INDEX idx_import_holdings_portfolio ON import_holdings(portfolio_id);

ALTER TABLE import_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own import_holdings"
  ON import_holdings FOR ALL USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. holdings — per-account per-company position snapshot (direct import, not FIFO)
-- ----------------------------------------------------------------------------
CREATE TABLE holdings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id      UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  isin              TEXT NOT NULL,                       -- denormalized: consolidation GROUP BY needs no join
  quantity          NUMERIC NOT NULL CHECK (quantity >= 0),
  avg_buy_price     NUMERIC NOT NULL CHECK (avg_buy_price >= 0),
  sector            TEXT,                                -- from statement, optional
  source            TEXT NOT NULL DEFAULT 'zerodha',     -- 'zerodha' | 'manual'
  import_holding_id UUID REFERENCES import_holdings(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (portfolio_id, account_id, company_id)          -- one row per stock per account per portfolio
);

CREATE INDEX idx_holdings_portfolio         ON holdings(portfolio_id);
CREATE INDEX idx_holdings_account           ON holdings(account_id);
CREATE INDEX idx_holdings_portfolio_company ON holdings(portfolio_id, company_id);

ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own holdings"
  ON holdings FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_holdings
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Stop auto-creating a default owner/account on signup.
--    The first account is created on first import (or first manual add).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
