-- ============================================================================
-- 005_indian_stocks_trailing_pe.sql — store Yahoo's trailing-twelve-months PE
-- ----------------------------------------------------------------------------
-- Adds a trailing_pe column to indian_stocks and teaches the price-refresh RPC
-- to write it. The PEG Analysis uses this TTM PE as its numerator. Only the
-- service refresh sends trailing_pe; the manual refresh omits the key, so the
-- CASE guard below leaves the stored value untouched (same pattern as market_cap).
-- Apply by hand in the Supabase Dashboard SQL editor.
-- ============================================================================

ALTER TABLE indian_stocks ADD COLUMN IF NOT EXISTS trailing_pe NUMERIC;

CREATE OR REPLACE FUNCTION bulk_update_stock_prices(
  p_rows jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;

  WITH updated AS (
    UPDATE indian_stocks AS s
       SET price        = (r->>'price')::numeric,
           change       = (r->>'change')::numeric,
           change_pct   = (r->>'change_pct')::numeric,
           volume       = (r->>'volume')::bigint,
           market_cap   = CASE WHEN r ? 'market_cap'
                               THEN (r->>'market_cap')::numeric
                               ELSE s.market_cap END,
           trailing_pe  = CASE WHEN r ? 'trailing_pe'
                               THEN (r->>'trailing_pe')::numeric
                               ELSE s.trailing_pe END,
           last_updated = (r->>'last_updated')::timestamptz
      FROM jsonb_array_elements(p_rows) AS r
     WHERE s.isin = r->>'isin'
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION bulk_update_stock_prices(jsonb) TO authenticated, service_role;
