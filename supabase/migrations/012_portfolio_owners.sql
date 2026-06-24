-- Portfolio Owners: family members / demat accounts managed by a single logged-in user
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

-- Add owner_id to transactions (nullable initially for backfill)
ALTER TABLE transactions
  ADD COLUMN owner_id UUID REFERENCES portfolio_owners(id);

-- Owner Holdings: per-owner per-company cached holding state (computed from transactions)
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

-- Create default owner for each existing user (using their display name from profiles)
INSERT INTO portfolio_owners (user_id, name, is_default)
SELECT p.id, COALESCE(p.display_name, p.email, 'Default'), true
FROM profiles p
ON CONFLICT (user_id, name) DO NOTHING;

-- Backfill existing transactions with the default owner
UPDATE transactions t
SET owner_id = po.id
FROM portfolio_owners po
WHERE po.user_id = t.user_id AND po.is_default = true
  AND t.owner_id IS NULL;

-- Now make owner_id NOT NULL
ALTER TABLE transactions ALTER COLUMN owner_id SET NOT NULL;

-- Drop old unique index on (user_id, trade_id) and create new one scoped to owner
DROP INDEX IF EXISTS idx_transactions_trade_id;
CREATE UNIQUE INDEX idx_transactions_owner_trade_id
  ON transactions (owner_id, trade_id)
  WHERE trade_id IS NOT NULL;

-- Index for querying transactions by owner
CREATE INDEX idx_transactions_owner ON transactions(owner_id);

-- Add owner_id to import_jobs for tracking which owner was imported for
ALTER TABLE import_jobs
  ADD COLUMN owner_id UUID REFERENCES portfolio_owners(id);

-- Auto-create default portfolio owner on new user signup
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
