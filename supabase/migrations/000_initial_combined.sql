-- ============================================================================
-- Combined Initial Schema
-- Consolidated from migrations 001–014 + holdings redesign + allocation ranges
-- + RPCs: replace_account_holdings (003), move_company (004),
--   bulk_update_stock_prices (005)
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Utility function: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Profiles (extends auth.users)
-- ============================================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro', 'premium')),
  plan_limits JSONB DEFAULT '{"max_companies": 50, "max_portfolios": 5, "alerts_enabled": true}',
  -- Per-star-rating target allocation ranges. NULL = app applies defaults:
  -- { "1": { "min": 0, "max": 2 }, "2": { "min": 2, "max": 4 }, "3": { "min": 4, "max": 6 }, "4": { "min": 6, "max": 8 } }
  allocation_ranges JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Auto-create profile on signup
-- (The first account is created on first import or first manual add.)
-- ============================================================================

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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- Portfolios (from 001 + 008)
-- ============================================================================

CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  type TEXT NOT NULL DEFAULT 'holdings' CHECK (type IN ('holdings', 'watchlist')),
  sort_order INTEGER DEFAULT 0,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own portfolios" ON portfolios FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ensure only one default portfolio per user
CREATE UNIQUE INDEX idx_portfolios_user_default
  ON portfolios (user_id) WHERE is_default = true;

-- ============================================================================
-- Indian Stocks — master catalog (from 004 + 006)
-- ============================================================================

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
  market_cap NUMERIC,
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

CREATE INDEX idx_indian_stocks_sector ON indian_stocks (sector);

CREATE INDEX idx_indian_stocks_last_updated
  ON indian_stocks (last_updated)
  WHERE last_updated IS NOT NULL;

-- RLS: readable by authenticated users, writable only by service role
ALTER TABLE indian_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read indian stocks"
  ON indian_stocks FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Companies — research/recommendation data only (positions live in `holdings`)
-- (from 001 + 004/005 normalize)
-- Note: name/symbol/sector/market_cap/current_price removed in 005;
--       quantity/avg_buy_price/buy_date removed in holdings redesign.
-- ============================================================================

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  isin TEXT NOT NULL REFERENCES indian_stocks(isin),
  buy_price NUMERIC,
  star_rating INTEGER CHECK (star_rating BETWEEN 1 AND 5),
  strategy TEXT CHECK (strategy IN ('core', 'satellite')),
  investment_horizon_years NUMERIC,
  expected_returns NUMERIC,
  thesis TEXT,
  highlights TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own companies" ON companies FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_companies_portfolio ON companies(portfolio_id);
CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_companies_isin ON companies(isin);

-- Prevent duplicate stock in same portfolio
CREATE UNIQUE INDEX idx_companies_portfolio_isin
  ON companies (portfolio_id, isin);

-- ============================================================================
-- Projection Models (from 002)
-- ============================================================================

CREATE TABLE projection_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projection_type TEXT NOT NULL CHECK (projection_type IN ('pe_earnings', 'ev_ebitda')),
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, projection_type)
);

CREATE UNIQUE INDEX idx_projection_models_one_default
  ON projection_models (company_id)
  WHERE is_default = true;

CREATE INDEX idx_projection_models_company ON projection_models(company_id);

ALTER TABLE projection_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own projection models"
  ON projection_models FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON projection_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Financial Years (from 001 + 002)
-- ============================================================================

CREATE TABLE financial_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projection_model_id UUID REFERENCES projection_models(id) ON DELETE CASCADE,
  year TEXT NOT NULL,
  is_estimate BOOLEAN DEFAULT false,
  revenue NUMERIC,
  revenue_growth_pct NUMERIC,
  ebitda NUMERIC,
  ebitda_margin_pct NUMERIC,
  ebitda_growth_pct NUMERIC,
  depreciation NUMERIC,
  finance_cost NUMERIC,
  other_income NUMERIC,
  exceptional_items NUMERIC,
  pbt NUMERIC,
  tax_pct NUMERIC,
  pat NUMERIC,
  pat_growth_pct NUMERIC,
  pat_margin_pct NUMERIC,
  minority_interest NUMERIC,
  pat_for_shareholders NUMERIC,
  pe NUMERIC,
  peg NUMERIC,
  net_debt NUMERIC,
  lease_liability NUMERIC,
  total_debt NUMERIC,
  ev_ebitda_ratio NUMERIC,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(projection_model_id, year)
);

ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own financial data" ON financial_years FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON financial_years FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_financial_years_company ON financial_years(company_id);
CREATE INDEX idx_financial_years_projection_model ON financial_years(projection_model_id);

-- ============================================================================
-- Valuation Scenarios (from 001 + 002)
-- ============================================================================

CREATE TABLE valuation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projection_model_id UUID REFERENCES projection_models(id) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('bull', 'base', 'bare')),
  target_pe NUMERIC,
  target_market_cap NUMERIC,
  irr NUMERIC,
  buying_market_cap NUMERIC,
  buy_price NUMERIC,
  target_ev_ebitda_ratio NUMERIC,
  expected_ev NUMERIC,
  net_debt_terminal NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(projection_model_id, scenario_type)
);

ALTER TABLE valuation_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own valuations" ON valuation_scenarios FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON valuation_scenarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_valuation_scenarios_company ON valuation_scenarios(company_id);
CREATE INDEX idx_valuation_scenarios_projection_model ON valuation_scenarios(projection_model_id);

-- ============================================================================
-- Timeline Entries (from 001)
-- ============================================================================

CREATE TABLE timeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quarter TEXT,
  entry_date DATE,
  content TEXT NOT NULL,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE timeline_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own timeline" ON timeline_entries FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON timeline_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_timeline_entries_company ON timeline_entries(company_id);

-- ============================================================================
-- Segment Valuations — SOTP (from 001)
-- ============================================================================

CREATE TABLE segment_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment_name TEXT NOT NULL,
  management_signal TEXT,
  metrics TEXT,
  multiple TEXT,
  estimated_value NUMERIC,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE segment_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own segments" ON segment_valuations FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_valuations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_segment_valuations_company ON segment_valuations(company_id);

-- ============================================================================
-- Market Perceptions (from 001)
-- ============================================================================

CREATE TABLE market_perceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  perception TEXT NOT NULL,
  own_view TEXT NOT NULL,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE market_perceptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own perceptions" ON market_perceptions FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON market_perceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_market_perceptions_company ON market_perceptions(company_id);

-- ============================================================================
-- Holdings model — direct import of broker HOLDINGS statements
-- (replaces the trade-import → FIFO → derived-holdings pipeline)
--
--   accounts        : broker demat accounts (flat; replaced portfolio_owners)
--   import_holdings : one row per statement import (replaced import_jobs)
--   holdings        : per-account per-company position snapshot (replaced owner_holdings)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- accounts — one row per broker demat account (user-scoped, shared across portfolios)
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
-- import_holdings — one row per statement import (synchronous; no polling)
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
-- holdings — per-account per-company position snapshot (direct import, not FIFO)
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

-- ============================================================================
-- Storage: attachments bucket (from 007)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', true, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- Atomic holdings replace (from 003)
-- ----------------------------------------------------------------------------
-- Replaces the non-transactional delete-then-insert in the holdings import
-- engine with a single-transaction Postgres function. The delete and insert
-- commit together or roll back together, so a failed/incomplete import can no
-- longer leave an account with its previous holdings wiped and nothing to
-- replace them.
--
-- SECURITY INVOKER (the default, stated explicitly) so the existing holdings
-- RLS policy `FOR ALL USING (auth.uid() = user_id)` still enforces per-user
-- isolation: the caller may only delete/insert their own rows, and INSERT's
-- WITH CHECK defaults to the USING expression.
-- ============================================================================

CREATE OR REPLACE FUNCTION replace_account_holdings(
  p_portfolio_id uuid,
  p_account_id   uuid,
  p_rows         jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM holdings
   WHERE portfolio_id = p_portfolio_id
     AND account_id   = p_account_id;

  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO holdings (
      user_id, portfolio_id, account_id, company_id, isin,
      quantity, avg_buy_price, sector, source, import_holding_id
    )
    SELECT
      (r->>'user_id')::uuid,
      (r->>'portfolio_id')::uuid,
      (r->>'account_id')::uuid,
      (r->>'company_id')::uuid,
      r->>'isin',
      (r->>'quantity')::numeric,
      (r->>'avg_buy_price')::numeric,
      nullif(r->>'sector', ''),
      r->>'source',
      (r->>'import_holding_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION replace_account_holdings(uuid, uuid, jsonb) TO authenticated;

-- ============================================================================
-- Atomic company move (from 004)
-- ----------------------------------------------------------------------------
-- Replaces the non-transactional move in `moveCompany`: it inserted the target
-- company, reconciled holdings, then deep-copied every research child record
-- across ~10 separate statements, and finally deleted the source. A failure at
-- any step left a half-copied company alongside a (possibly) deleted original.
--
-- This function does the entire move — insert target company, reconcile
-- holdings (creating the account when needed), copy projection_models +
-- financial_years + valuation_scenarios + timeline_entries +
-- segment_valuations + market_perceptions, then delete the source — inside one
-- transaction. Everything commits together or rolls back together. It also owns
-- the duplicate-stock and account-required checks, raising them as errors the
-- caller surfaces verbatim.
--
-- SECURITY INVOKER (the default, stated explicitly) so every table's RLS policy
-- `FOR ALL USING (auth.uid() = user_id)` keeps enforcing per-user isolation:
-- the caller may only read/insert/delete their own rows, and each INSERT's
-- WITH CHECK defaults to the USING expression. A company/portfolio that isn't
-- the caller's is simply invisible → "not found".
-- ============================================================================

CREATE OR REPLACE FUNCTION move_company(
  p_company_id          uuid,
  p_target_portfolio_id uuid,
  p_notes               text    DEFAULT NULL,
  p_account_id          uuid    DEFAULT NULL,
  p_new_account_label   text    DEFAULT NULL,
  p_quantity            numeric DEFAULT NULL,
  p_avg_buy_price       numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_source        companies%ROWTYPE;
  v_user_id       uuid;
  v_isin          text;
  v_target_type   text;
  v_new_company   uuid;
  v_account_id    uuid;
  v_new_label     text;
BEGIN
  -- 1. Source company (RLS restricts this to the caller's own rows).
  SELECT * INTO v_source FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  v_user_id := v_source.user_id;
  v_isin    := v_source.isin;

  -- 2. Target portfolio type.
  SELECT type INTO v_target_type FROM portfolios WHERE id = p_target_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target portfolio not found';
  END IF;

  -- 3. Reject a duplicate stock already in the target portfolio.
  IF EXISTS (
    SELECT 1 FROM companies
     WHERE portfolio_id = p_target_portfolio_id
       AND isin = v_isin
  ) THEN
    RAISE EXCEPTION 'This stock already exists in the target portfolio.';
  END IF;

  -- 4. Insert the target company (research fields only; positions live in `holdings`).
  INSERT INTO companies (
    portfolio_id, user_id, isin, buy_price, star_rating, strategy,
    investment_horizon_years, expected_returns, thesis, highlights, notes
  ) VALUES (
    p_target_portfolio_id, v_user_id, v_isin, v_source.buy_price, v_source.star_rating,
    v_source.strategy, v_source.investment_horizon_years, v_source.expected_returns,
    v_source.thesis, v_source.highlights, p_notes
  )
  RETURNING id INTO v_new_company;

  -- 4b. Reconcile holdings for the move.
  IF v_target_type = 'watchlist' THEN
    -- Moving out of holdings — unlink by dropping every position.
    DELETE FROM holdings WHERE company_id = p_company_id;
  ELSIF EXISTS (SELECT 1 FROM holdings WHERE company_id = p_company_id) THEN
    -- Existing positions move with the stock, keeping their own accounts.
    UPDATE holdings
       SET company_id  = v_new_company,
           portfolio_id = p_target_portfolio_id
     WHERE company_id = p_company_id;
  ELSE
    -- No position to carry — an account is required to create the initial
    -- (possibly zero-qty) holding so the company belongs to an account.
    v_new_label := btrim(coalesce(p_new_account_label, ''));
    IF v_new_label <> '' THEN
      BEGIN
        INSERT INTO accounts (user_id, label, broker)
        VALUES (v_user_id, v_new_label, 'manual')
        RETURNING id INTO v_account_id;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'An account named "%" already exists', v_new_label;
      END;
    ELSIF p_account_id IS NOT NULL THEN
      v_account_id := p_account_id;
    ELSE
      RAISE EXCEPTION 'Select an account to move this stock into holdings.';
    END IF;

    INSERT INTO holdings (
      user_id, portfolio_id, account_id, company_id, isin,
      quantity, avg_buy_price, source, import_holding_id
    ) VALUES (
      v_user_id, p_target_portfolio_id, v_account_id, v_new_company, v_isin,
      coalesce(p_quantity, 0), coalesce(p_avg_buy_price, 0), 'manual', NULL
    );
  END IF;

  -- 5. Copy research child records. projection_models first so financial_years
  --    and valuation_scenarios can be remapped to the new model ids via the
  --    (company_id, projection_type) unique key.
  INSERT INTO projection_models (
    company_id, user_id, projection_type, name, is_default, sort_order
  )
  SELECT v_new_company, user_id, projection_type, name, is_default, sort_order
    FROM projection_models
   WHERE company_id = p_company_id;

  INSERT INTO financial_years (
    company_id, projection_model_id, user_id, year, is_estimate, revenue,
    revenue_growth_pct, ebitda, ebitda_margin_pct, ebitda_growth_pct, depreciation,
    finance_cost, other_income, exceptional_items, pbt, tax_pct, pat, pat_growth_pct,
    pat_margin_pct, minority_interest, pat_for_shareholders, pe, peg, net_debt,
    lease_liability, total_debt, ev_ebitda_ratio, sort_order
  )
  SELECT
    v_new_company, npm.id, fy.user_id, fy.year, fy.is_estimate, fy.revenue,
    fy.revenue_growth_pct, fy.ebitda, fy.ebitda_margin_pct, fy.ebitda_growth_pct,
    fy.depreciation, fy.finance_cost, fy.other_income, fy.exceptional_items, fy.pbt,
    fy.tax_pct, fy.pat, fy.pat_growth_pct, fy.pat_margin_pct, fy.minority_interest,
    fy.pat_for_shareholders, fy.pe, fy.peg, fy.net_debt, fy.lease_liability,
    fy.total_debt, fy.ev_ebitda_ratio, fy.sort_order
  FROM financial_years fy
  JOIN projection_models opm ON opm.id = fy.projection_model_id
  JOIN projection_models npm
    ON npm.company_id = v_new_company
   AND npm.projection_type = opm.projection_type
  WHERE fy.company_id = p_company_id;

  INSERT INTO valuation_scenarios (
    company_id, projection_model_id, user_id, scenario_type, target_pe,
    target_market_cap, irr, buying_market_cap, buy_price, target_ev_ebitda_ratio,
    expected_ev, net_debt_terminal
  )
  SELECT
    v_new_company, npm.id, vs.user_id, vs.scenario_type, vs.target_pe,
    vs.target_market_cap, vs.irr, vs.buying_market_cap, vs.buy_price,
    vs.target_ev_ebitda_ratio, vs.expected_ev, vs.net_debt_terminal
  FROM valuation_scenarios vs
  JOIN projection_models opm ON opm.id = vs.projection_model_id
  JOIN projection_models npm
    ON npm.company_id = v_new_company
   AND npm.projection_type = opm.projection_type
  WHERE vs.company_id = p_company_id;

  INSERT INTO timeline_entries (
    company_id, user_id, quarter, entry_date, content, sort_order
  )
  SELECT v_new_company, user_id, quarter, entry_date, content, sort_order
    FROM timeline_entries
   WHERE company_id = p_company_id;

  INSERT INTO segment_valuations (
    company_id, user_id, segment_name, management_signal, metrics, multiple,
    estimated_value, sort_order
  )
  SELECT v_new_company, user_id, segment_name, management_signal, metrics, multiple,
         estimated_value, sort_order
    FROM segment_valuations
   WHERE company_id = p_company_id;

  INSERT INTO market_perceptions (
    company_id, user_id, perception, own_view, sort_order
  )
  SELECT v_new_company, user_id, perception, own_view, sort_order
    FROM market_perceptions
   WHERE company_id = p_company_id;

  -- 6. Delete the source company (CASCADE removes its remaining children).
  DELETE FROM companies WHERE id = p_company_id;

  RETURN v_new_company;
END;
$$;

GRANT EXECUTE ON FUNCTION move_company(uuid, uuid, text, uuid, text, numeric, numeric) TO authenticated;

-- ============================================================================
-- Bulk stock price update (from 005)
-- ----------------------------------------------------------------------------
-- Replaces the per-row `UPDATE ... WHERE isin = ?` loop in the price refresh
-- paths (src/lib/services/price-refresh.ts and the manual refresh action) with
-- a single-statement bulk UPDATE. Refreshing 100 stocks previously meant 100
-- serialized round-trips to Postgres; this collapses them into one.
--
-- A plain upsert is NOT usable here: `indian_stocks` has NOT NULL columns with
-- no default (`name`, `exchange`), so PostgREST's insert-on-conflict would
-- reject the batch even though every row already exists. An UPDATE ... FROM a
-- jsonb array touches only the price columns and sidesteps that entirely.
--
-- `market_cap` is updated only when the caller includes the key: the service
-- refresh sends it, the manual refresh does not, and this preserves each
-- caller's existing behavior (manual refresh never touched market_cap before).
--
-- SECURITY INVOKER (default): both callers use the service-role admin client,
-- which bypasses RLS, so no elevated privileges are needed here.
-- ============================================================================

CREATE OR REPLACE FUNCTION bulk_update_stock_prices(
  p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE indian_stocks AS s
       SET price        = (r->>'price')::numeric,
           change       = (r->>'change')::numeric,
           change_pct   = (r->>'change_pct')::numeric,
           volume       = (r->>'volume')::bigint,
           market_cap   = CASE WHEN r ? 'market_cap'
                               THEN (r->>'market_cap')::numeric
                               ELSE s.market_cap END,
           last_updated = (r->>'last_updated')::timestamptz
      FROM jsonb_array_elements(p_rows) AS r
     WHERE s.isin = r->>'isin'
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_update_stock_prices(jsonb) TO authenticated, service_role;

-- ============================================================================
-- Data API grants
-- ----------------------------------------------------------------------------
-- Supabase's newer cloud default does NOT auto-expose objects created in the
-- `public` schema by `postgres` to the Data API roles (anon, authenticated,
-- service_role) -- unlike the legacy default, which installed matching
-- ALTER DEFAULT PRIVILEGES at project bootstrap. Without these grants, a
-- logged-in read/write fails with "permission denied for table ...".
-- RLS (enabled per-table above) remains the actual row-access gate; these
-- grants only let the roles reach the objects at all. Must run AFTER all
-- tables/functions above are created.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Auto-expose future objects created by postgres too (restores legacy behaviour).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
