-- Profiles (extends auth.users)
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

-- Auto-create profile on signup
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

-- Portfolios
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own portfolios" ON portfolios FOR ALL USING (auth.uid() = user_id);

-- Companies
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  symbol TEXT,
  sector TEXT,
  market_cap NUMERIC,
  current_price NUMERIC,
  buy_price NUMERIC,
  star_rating INTEGER CHECK (star_rating BETWEEN 1 AND 5),
  strategy TEXT CHECK (strategy IN ('core', 'satellite')),
  investment_horizon_years NUMERIC,
  expected_returns NUMERIC,
  thesis TEXT,
  highlights TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own companies" ON companies FOR ALL USING (auth.uid() = user_id);

-- Financial Years
CREATE TABLE financial_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, year)
);

ALTER TABLE financial_years ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own financial data" ON financial_years FOR ALL USING (auth.uid() = user_id);

-- Valuation Scenarios
CREATE TABLE valuation_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('bull', 'base', 'bare')),
  target_pe NUMERIC,
  target_market_cap NUMERIC,
  irr NUMERIC,
  buying_market_cap NUMERIC,
  buy_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, scenario_type)
);

ALTER TABLE valuation_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own valuations" ON valuation_scenarios FOR ALL USING (auth.uid() = user_id);

-- Timeline Entries
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

-- Segment Valuations (SOTP)
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

-- Market Perceptions
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

-- Indexes for performance
CREATE INDEX idx_companies_portfolio ON companies(portfolio_id);
CREATE INDEX idx_companies_user ON companies(user_id);
CREATE INDEX idx_financial_years_company ON financial_years(company_id);
CREATE INDEX idx_valuation_scenarios_company ON valuation_scenarios(company_id);
CREATE INDEX idx_timeline_entries_company ON timeline_entries(company_id);
CREATE INDEX idx_segment_valuations_company ON segment_valuations(company_id);
CREATE INDEX idx_market_perceptions_company ON market_perceptions(company_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON financial_years FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON valuation_scenarios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON timeline_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON segment_valuations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON market_perceptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
