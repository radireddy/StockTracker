-- =============================================================================
-- Cleanup: remove companies from the "Holdings" portfolio that are NOT held in
-- any account and have no star rating.
--
-- Deleting a company row CASCADEs to all its research data:
--   projection_models, financial_years, valuation_scenarios,
--   timeline_entries, segment_valuations, market_perceptions
-- The master stock catalog (indian_stocks) is only referenced, NOT cascaded,
-- so the "actual stock details" are preserved.
--
-- HOW TO USE:
--   1. Run STEP 1 first and review the rows it lists.
--   2. If the list looks right, run STEP 2 to delete them.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1 — PREVIEW: what will be deleted (run this first, deletes nothing)
-- -----------------------------------------------------------------------------
SELECT
  c.id,
  s.name        AS stock_name,
  c.isin,
  c.star_rating,
  c.strategy
FROM companies c
JOIN portfolios p     ON p.id = c.portfolio_id
LEFT JOIN indian_stocks s ON s.isin = c.isin
WHERE p.name = 'Holdings'
  AND c.star_rating IS NULL                              -- unrated
  AND NOT EXISTS (                                       -- not held in any account
    SELECT 1 FROM holdings h WHERE h.company_id = c.id
  )
ORDER BY s.name;


-- -----------------------------------------------------------------------------
-- STEP 2 — DELETE (run only after confirming STEP 1's list)
-- Wrapped in a transaction; RAISES the deleted count. Remove the ROLLBACK
-- line and keep COMMIT once you're happy — or run as-is to dry-run, then flip.
-- -----------------------------------------------------------------------------
BEGIN;

WITH deleted AS (
  DELETE FROM companies c
  USING portfolios p
  WHERE c.portfolio_id = p.id
    AND p.name = 'Holdings'
    AND c.star_rating IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM holdings h WHERE h.company_id = c.id
    )
  RETURNING c.id
)
SELECT count(*) AS companies_deleted FROM deleted;

-- Review the count above. Then COMMIT to apply, or ROLLBACK to undo.
COMMIT;
-- ROLLBACK;
