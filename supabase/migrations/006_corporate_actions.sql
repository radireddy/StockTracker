-- ============================================================================
-- 006_corporate_actions.sql — Stable security identity + corporate actions
-- ----------------------------------------------------------------------------
-- Apply manually via Supabase Dashboard SQL editor.
--
-- Adds:
--   1. indian_stocks.canonical_stock_id  — supersession pointer (ISIN/symbol
--      changes unify an old forked row onto its new canonical row). One level
--      only (no chains), enforced by a trigger.
--   2. corporate_actions                 — global, seeded split/bonus facts
--      (share-multiplier factor applied to trades before the ex_date).
--   3. open_position_snapshots           — per-account aggregated FIFO result
--      in current units; read by the trades dashboard.
-- ============================================================================

-- ============================================================================
-- 1. Supersession pointer on indian_stocks
-- ============================================================================
ALTER TABLE indian_stocks
  ADD COLUMN IF NOT EXISTS canonical_stock_id UUID REFERENCES indian_stocks(id);

CREATE INDEX IF NOT EXISTS idx_indian_stocks_canonical
  ON indian_stocks (canonical_stock_id)
  WHERE canonical_stock_id IS NOT NULL;

-- Enforce: no chains. A row referenced as someone's canonical must itself be
-- canonical (canonical_stock_id IS NULL); and a row cannot point to itself.
CREATE OR REPLACE FUNCTION enforce_canonical_one_level() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.canonical_stock_id IS NOT NULL THEN
    IF NEW.canonical_stock_id = NEW.id THEN
      RAISE EXCEPTION 'canonical_stock_id cannot reference itself (%)', NEW.id;
    END IF;
    IF EXISTS (
      SELECT 1 FROM indian_stocks
      WHERE id = NEW.canonical_stock_id AND canonical_stock_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'canonical_stock_id must point to a canonical row (no chains): %', NEW.canonical_stock_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_canonical_one_level ON indian_stocks;
CREATE TRIGGER trg_enforce_canonical_one_level
  BEFORE INSERT OR UPDATE OF canonical_stock_id ON indian_stocks
  FOR EACH ROW EXECUTE FUNCTION enforce_canonical_one_level();

-- ============================================================================
-- 2. corporate_actions — global reference data (seeded manually)
-- ============================================================================
CREATE TABLE IF NOT EXISTS corporate_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_id    UUID NOT NULL REFERENCES indian_stocks(id),  -- canonical security
  action_type TEXT NOT NULL CHECK (action_type IN ('split', 'bonus')),
  ex_date     DATE NOT NULL,
  factor      NUMERIC(20,8) NOT NULL CHECK (factor > 0),   -- share multiplier
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (stock_id, action_type, ex_date)
);

CREATE INDEX IF NOT EXISTS idx_corporate_actions_stock
  ON corporate_actions (stock_id, ex_date);

-- Reference data: readable by any authenticated user, writes via service role.
ALTER TABLE corporate_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read corporate_actions" ON corporate_actions;
CREATE POLICY "Authenticated can read corporate_actions"
  ON corporate_actions FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 3. open_position_snapshots — per-account aggregated FIFO output
-- ============================================================================
CREATE TABLE IF NOT EXISTS open_position_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stock_id      UUID REFERENCES indian_stocks(id),   -- canonical
  isin          TEXT,                                 -- canonical isin (cache)
  symbol        TEXT,
  quantity      NUMERIC(20,4) NOT NULL,               -- current units
  avg_buy_price NUMERIC(20,6) NOT NULL,               -- adjusted cost basis
  computed_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (account_id, stock_id)
);

ALTER TABLE open_position_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own open_position_snapshots" ON open_position_snapshots;
CREATE POLICY "Users manage own open_position_snapshots"
  ON open_position_snapshots FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_open_pos_snap_account
  ON open_position_snapshots (account_id);

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'indian_stocks' AND column_name = 'canonical_stock_id';
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('corporate_actions','open_position_snapshots');
-- ---------------------------------------------------------------------------
