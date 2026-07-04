-- ============================================================================
-- Bulk stock price update
-- ----------------------------------------------------------------------------
-- Replaces the per-row `UPDATE ... WHERE isin = ?` loop in the price refresh
-- paths (src/lib/services/price-refresh.ts and the manual refresh action) with
-- a single-statement bulk UPDATE. Refreshing 100 stocks previously meant 100
-- serialized round-trips to Postgres; this collapses them into one.
--
-- A plain upsert is NOT usable here: `indian_stocks` has NOT NULL columns with
-- no default (`name`, `exchange`), so PostgREST's insert-on-conflict would
-- reject the batch even though every row already exists. An UPDATE ... FROM a
-- jsonb array touches only the price columns and sidesteps that entirely.
--
-- `market_cap` is updated only when the caller includes the key: the service
-- refresh sends it, the manual refresh does not, and this preserves each
-- caller's existing behavior (manual refresh never touched market_cap before).
--
-- SECURITY INVOKER (default): both callers use the service-role admin client,
-- which bypasses RLS, so no elevated privileges are needed here.
--
-- NOTE: apply this by hand in the Supabase Dashboard SQL editor — the project
-- is not CLI-linked.
-- ============================================================================

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
