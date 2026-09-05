-- 007_corporate_action_source.sql — CA reference feed + sync watermark.
-- Apply manually via Supabase Dashboard SQL editor.

ALTER TABLE corporate_actions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('nse', 'manual', 'inferred'));

CREATE TABLE IF NOT EXISTS corporate_action_ref (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  isin        TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('split','bonus')),
  ex_date     DATE NOT NULL,
  factor      NUMERIC(20,8) NOT NULL CHECK (factor > 0),
  raw_subject TEXT,
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, symbol, action_type, ex_date)
);
CREATE INDEX IF NOT EXISTS idx_ca_ref_symbol_exdate ON corporate_action_ref (symbol, ex_date);
CREATE INDEX IF NOT EXISTS idx_ca_ref_isin_exdate ON corporate_action_ref (isin, ex_date) WHERE isin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ca_ref_exdate ON corporate_action_ref (ex_date);

ALTER TABLE corporate_action_ref ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can read corporate_action_ref" ON corporate_action_ref;
CREATE POLICY "Authenticated can read corporate_action_ref"
  ON corporate_action_ref FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS corporate_action_sync_state (
  source          TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ NOT NULL
);
