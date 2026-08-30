-- ============================================================================
-- 002_stock_id_expand.sql — Stable stock identity, PHASE A (EXPAND)
-- ----------------------------------------------------------------------------
-- Introduces a surrogate primary identity for stocks so corporate actions that
-- change a stock's ISIN (splits, face-value changes) or NSE symbol (renames)
-- never fork a company or orphan its price/research.
--
-- This phase is PURELY ADDITIVE and 100% backward compatible:
--   * `indian_stocks.id` (UUID) is added and backfilled; `isin` stays the PK.
--   * `companies.stock_id` / `holdings.stock_id` are added NULLABLE, backfilled,
--     FK'd to `indian_stocks(id)`, and indexed.
--   * A BEFORE INSERT/UPDATE trigger keeps `isin` <-> `stock_id` consistent so
--     the currently-deployed app (writes `isin` only) and the next app (writes
--     `stock_id`) both produce correct rows.
--
-- Nothing here removes or tightens anything, so the live app is unaffected.
-- Apply once, in the Supabase Dashboard SQL editor. Idempotent-safe to re-run.
-- ============================================================================

BEGIN;

-- 1. Surrogate id on the catalog. A volatile default assigns a distinct UUID to
--    every existing row during the ADD COLUMN rewrite.
ALTER TABLE indian_stocks ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_indian_stocks_id ON indian_stocks (id);

-- 2. stock_id on the referencing tables (nullable during the transition).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stock_id UUID;
ALTER TABLE holdings  ADD COLUMN IF NOT EXISTS stock_id UUID;

-- 3. Backfill from the existing isin join.
UPDATE companies c SET stock_id = s.id FROM indian_stocks s
 WHERE c.stock_id IS NULL AND c.isin = s.isin;
UPDATE holdings h SET stock_id = s.id FROM indian_stocks s
 WHERE h.stock_id IS NULL AND h.isin = s.isin;

-- 4. Foreign keys (guarded so re-running is safe).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_stock_id_fkey') THEN
    ALTER TABLE companies ADD CONSTRAINT companies_stock_id_fkey
      FOREIGN KEY (stock_id) REFERENCES indian_stocks(id) NOT VALID;
    ALTER TABLE companies VALIDATE CONSTRAINT companies_stock_id_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'holdings_stock_id_fkey') THEN
    ALTER TABLE holdings ADD CONSTRAINT holdings_stock_id_fkey
      FOREIGN KEY (stock_id) REFERENCES indian_stocks(id) NOT VALID;
    ALTER TABLE holdings VALIDATE CONSTRAINT holdings_stock_id_fkey;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_stock_id ON companies (stock_id);
CREATE INDEX IF NOT EXISTS idx_holdings_stock_id  ON holdings (stock_id);

-- 5. Sync trigger — keep isin (denormalized cache) and stock_id (identity)
--    consistent regardless of which one the caller sets.
--    * old code sets isin only        -> resolve stock_id from isin
--    * new code sets stock_id (no isin)-> fill isin cache from the stock
CREATE OR REPLACE FUNCTION sync_stock_id_isin() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stock_id IS NOT NULL THEN
    IF NEW.isin IS NULL OR NEW.isin = '' THEN
      SELECT isin INTO NEW.isin FROM indian_stocks WHERE id = NEW.stock_id;
    END IF;
  ELSIF NEW.isin IS NOT NULL AND NEW.isin <> '' THEN
    SELECT id INTO NEW.stock_id FROM indian_stocks WHERE isin = NEW.isin;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_stock_id_isin_companies ON companies;
CREATE TRIGGER trg_sync_stock_id_isin_companies
  BEFORE INSERT OR UPDATE OF isin, stock_id ON companies
  FOR EACH ROW EXECUTE FUNCTION sync_stock_id_isin();

DROP TRIGGER IF EXISTS trg_sync_stock_id_isin_holdings ON holdings;
CREATE TRIGGER trg_sync_stock_id_isin_holdings
  BEFORE INSERT OR UPDATE OF isin, stock_id ON holdings
  FOR EACH ROW EXECUTE FUNCTION sync_stock_id_isin();

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION (run separately; both counts must be 0):
--   SELECT count(*) FROM companies WHERE stock_id IS NULL;
--   SELECT count(*) FROM holdings  WHERE stock_id IS NULL;
-- Any non-zero rows have an isin absent from indian_stocks — inspect before
-- proceeding to Phase C. (Expected: 0 / 0.)
-- ---------------------------------------------------------------------------
