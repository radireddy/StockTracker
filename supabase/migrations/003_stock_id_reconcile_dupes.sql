-- ============================================================================
-- 003_stock_id_reconcile_dupes.sql — Stable stock identity, PHASE B (RECONCILE)
-- ----------------------------------------------------------------------------
-- The pre-fix importer created a DUPLICATE indian_stocks row when a split
-- changed a stock's ISIN: the new-ISIN row is an empty stub (no symbol/price),
-- while the old-ISIN row still holds the symbol + price and is referenced by
-- several companies. After 002 these are two different stock_ids for the SAME
-- stock. This one-off merges them onto ONE canonical stock_id.
--
-- Known live case: TD Power Systems — INE419M01027 (canonical, has price ~752.7
-- and nse_symbol TDPOWERSYS) vs INE419M01035 (empty stub, current post-split
-- ISIN). Canonical adopts the current ISIN; everything repoints to it; the stub
-- is deleted.
--
-- NOTE on the ISIN FK: `companies.isin -> indian_stocks(isin)` is ON UPDATE
-- NO ACTION, so we cannot delete/re-key a referenced catalog row while any
-- company points at it by isin. We therefore lift that FK for the duration of
-- the merge and restore it at the end (Phase D drops it permanently). This all
-- runs in ONE transaction, so external readers never see the FK missing.
--
-- Apply ONCE, after 002. Safe to re-run (no-op if the stub is already gone).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_canon uuid;   -- keep this row (has symbol + price, widely referenced)
  v_stub  uuid;   -- delete this empty duplicate
  v_new_isin text := 'INE419M01035';   -- current (post-split) ISIN
  v_old_isin text := 'INE419M01027';   -- pre-split ISIN on the canonical row
BEGIN
  SELECT id INTO v_canon FROM indian_stocks WHERE isin = v_old_isin;
  SELECT id INTO v_stub  FROM indian_stocks WHERE isin = v_new_isin;

  IF v_canon IS NULL OR v_stub IS NULL THEN
    RAISE NOTICE 'TD Power: canonical (%) or stub (%) not both present — nothing to reconcile', v_old_isin, v_new_isin;
    RETURN;
  END IF;

  -- 0. Lift the isin FK so the catalog row can be re-keyed / the stub deleted.
  ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_isin_fkey;

  -- 1. Repoint every company/holding that sits on the stub onto the canonical stock.
  UPDATE companies SET stock_id = v_canon WHERE stock_id = v_stub;
  UPDATE holdings  SET stock_id = v_canon WHERE stock_id = v_stub;

  -- 2. Delete the now-unreferenced stub, freeing the current ISIN value.
  DELETE FROM indian_stocks WHERE id = v_stub;

  -- 3. Canonical adopts the current (post-split) ISIN; its symbol + price stay.
  UPDATE indian_stocks SET isin = v_new_isin WHERE id = v_canon;

  -- 4. Keep the denormalized isin cache on ALL referencing rows consistent with
  --    the canonical stock's current ISIN (also required so the restored FK is
  --    satisfied — the old isin no longer exists in indian_stocks).
  UPDATE companies SET isin = v_new_isin WHERE stock_id = v_canon AND isin IS DISTINCT FROM v_new_isin;
  UPDATE holdings  SET isin = v_new_isin WHERE stock_id = v_canon AND isin IS DISTINCT FROM v_new_isin;

  -- 5. Restore the isin FK (every company now references a valid catalog row).
  ALTER TABLE companies ADD CONSTRAINT companies_isin_fkey
    FOREIGN KEY (isin) REFERENCES indian_stocks(isin);

  RAISE NOTICE 'TD Power reconciled onto stock_id %', v_canon;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION:
--   -- Exactly ONE catalog row for the symbol, carrying the price:
--   SELECT id, isin, nse_symbol, price, market_cap FROM indian_stocks WHERE nse_symbol = 'TDPOWERSYS';
--   -- All TD Power companies share that one stock_id (and current isin):
--   SELECT c.id, c.portfolio_id, c.isin, c.stock_id FROM companies c
--     JOIN indian_stocks s ON s.id = c.stock_id WHERE s.nse_symbol = 'TDPOWERSYS';
--
-- Detect any OTHER split-duplicated stocks to review (a symbol on 2+ ISINs):
--   SELECT nse_symbol, array_agg(isin) FROM indian_stocks
--    WHERE nse_symbol IS NOT NULL GROUP BY nse_symbol HAVING count(*) > 1;
-- ---------------------------------------------------------------------------
