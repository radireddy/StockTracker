-- Corporate actions table: tracks splits, bonuses, demergers, mergers, renames
-- These events are NOT in tradebooks — they come from depository (NSDL/CDSL)
-- and must be tracked separately to compute correct FIFO holdings.

CREATE TABLE corporate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,

  -- What stock this applies to (pre-action)
  symbol TEXT NOT NULL,
  isin TEXT NOT NULL,

  -- Action type
  action_type TEXT NOT NULL CHECK (action_type IN (
    'STOCK_SPLIT', 'BONUS', 'DEMERGER', 'MERGER', 'SYMBOL_RENAME'
  )),

  -- When it happened
  ex_date DATE NOT NULL,

  -- Ratio: e.g. 1:5 split = ratio_from=1, ratio_to=5
  -- Bonus 2:1 = ratio_from=2, ratio_to=1 (2 bonus for every 1 held)
  ratio_from INTEGER,
  ratio_to INTEGER,

  -- For demergers: new entity details
  new_symbol TEXT,
  new_isin TEXT,

  -- For demergers: cost allocation % to parent (e.g. 95.32 means parent keeps 95.32% of cost)
  parent_cost_pct NUMERIC,

  -- For symbol renames
  old_symbol TEXT,

  -- Status: pending = detected but not yet confirmed by user
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'dismissed')),

  -- How it was detected
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
