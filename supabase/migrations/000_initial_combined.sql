-- ============================================================================
-- Combined Initial Schema
-- Consolidated from migrations 001–014
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Portfolio Owners: family members / demat accounts managed by a single user
-- (from 012)
-- ============================================================================

CREATE TABLE portfolio_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pan_number TEXT,
  mobile TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE portfolio_owners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own portfolio owners"
  ON portfolio_owners FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_portfolio_owners
  BEFORE UPDATE ON portfolio_owners
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Ensure only one default owner per user
CREATE UNIQUE INDEX idx_portfolio_owners_user_default
  ON portfolio_owners (user_id) WHERE is_default = true;

-- ============================================================================
-- Auto-create profile + default owner on signup (from 012, replaces 001)
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
  -- Auto-create default portfolio owner
  INSERT INTO public.portfolio_owners (user_id, name, is_default)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    true
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
-- Companies (from 001 + 004/005 normalize + 009 holdings fields)
-- Note: name/symbol/sector/market_cap/current_price removed in 005
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
  quantity NUMERIC,
  avg_buy_price NUMERIC,
  buy_date DATE,
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
-- Transactions (from 010 + 011 + 012 + 014)
-- ============================================================================

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  owner_id UUID NOT NULL REFERENCES portfolio_owners(id),
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL CHECK (price >= 0),
  fees NUMERIC DEFAULT 0 CHECK (fees >= 0),
  date DATE NOT NULL,
  notes TEXT,
  source TEXT DEFAULT 'manual',
  trade_id TEXT,
  trade_ids JSONB DEFAULT '[]',
  order_id TEXT,
  exchange TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_company_date ON transactions (company_id, date);
CREATE INDEX idx_transactions_user ON transactions (user_id);
CREATE INDEX idx_transactions_owner ON transactions(owner_id);

-- Unique constraint on trade_id per owner for idempotency
CREATE UNIQUE INDEX idx_transactions_owner_trade_id
  ON transactions (owner_id, trade_id)
  WHERE trade_id IS NOT NULL;

-- GIN index on trade_ids for fast containment checks
CREATE INDEX idx_transactions_trade_ids
  ON transactions USING GIN (trade_ids);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Owner Holdings: per-owner per-company cached state (from 012)
-- ============================================================================

CREATE TABLE owner_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES portfolio_owners(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity NUMERIC DEFAULT 0,
  avg_buy_price NUMERIC,
  buy_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, owner_id)
);

ALTER TABLE owner_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own owner holdings"
  ON owner_holdings FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_owner_holdings_company ON owner_holdings(company_id);
CREATE INDEX idx_owner_holdings_owner ON owner_holdings(owner_id);

CREATE TRIGGER set_updated_at_owner_holdings
  BEFORE UPDATE ON owner_holdings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Import Jobs (from 011 + 012 + 014)
-- ============================================================================

CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES portfolio_owners(id),
  source TEXT NOT NULL DEFAULT 'zerodha',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_name TEXT,
  total_rows INTEGER DEFAULT 0,
  processed_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}',
  errors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_import_jobs_user ON import_jobs (user_id);
CREATE INDEX idx_import_jobs_status ON import_jobs (user_id, status);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access own import jobs"
  ON import_jobs FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_import_jobs
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- Corporate Actions (from 013)
-- ============================================================================

CREATE TABLE corporate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  isin TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'STOCK_SPLIT', 'BONUS', 'DEMERGER', 'MERGER', 'SYMBOL_RENAME'
  )),
  ex_date DATE NOT NULL,
  ratio_from INTEGER,
  ratio_to INTEGER,
  new_symbol TEXT,
  new_isin TEXT,
  parent_cost_pct NUMERIC,
  old_symbol TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  source TEXT NOT NULL DEFAULT 'auto_detected' CHECK (source IN ('auto_detected', 'manual', 'api')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_corporate_actions_user ON corporate_actions(user_id);
CREATE INDEX idx_corporate_actions_portfolio ON corporate_actions(portfolio_id);
CREATE INDEX idx_corporate_actions_isin ON corporate_actions(isin);
CREATE INDEX idx_corporate_actions_status ON corporate_actions(user_id, status);

ALTER TABLE corporate_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own corporate actions"
  ON corporate_actions FOR ALL
  USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_corporate_actions
  BEFORE UPDATE ON corporate_actions
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
