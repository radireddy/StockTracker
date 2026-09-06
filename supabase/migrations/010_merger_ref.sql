-- supabase/migrations/010_merger_ref.sql
-- Extends corporate_action_ref to support merger/amalgamation events.
-- Apply manually via Supabase Dashboard SQL editor.

-- 1. Allow 'merger' in action_type (drop + recreate check constraint).
ALTER TABLE corporate_action_ref
  DROP CONSTRAINT IF EXISTS corporate_action_ref_action_type_check;

ALTER TABLE corporate_action_ref
  ADD CONSTRAINT corporate_action_ref_action_type_check
    CHECK (action_type IN ('split', 'bonus', 'merger'));

-- 2. Make factor nullable — merger ratio is often absent from the feed subject.
ALTER TABLE corporate_action_ref
  ALTER COLUMN factor DROP NOT NULL;

-- Replace NOT NULL + implied > 0 with: null OR > 0.
ALTER TABLE corporate_action_ref
  DROP CONSTRAINT IF EXISTS corporate_action_ref_factor_check;

ALTER TABLE corporate_action_ref
  ADD CONSTRAINT corporate_action_ref_factor_check
    CHECK (factor IS NULL OR factor > 0);

-- 3. Add acquirer columns (nullable; splits/bonuses leave these NULL).
ALTER TABLE corporate_action_ref
  ADD COLUMN IF NOT EXISTS acquirer_symbol TEXT;

ALTER TABLE corporate_action_ref
  ADD COLUMN IF NOT EXISTS acquirer_isin TEXT;

CREATE INDEX IF NOT EXISTS idx_ca_ref_merger_symbol
  ON corporate_action_ref (symbol, ex_date)
  WHERE action_type = 'merger';

-- POST-APPLY CHECK:
--   SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_name = 'corporate_action_ref'
--   ORDER BY ordinal_position;
