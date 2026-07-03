-- ============================================================================
-- Atomic holdings replace
-- ----------------------------------------------------------------------------
-- Replaces the non-transactional delete-then-insert in the holdings import
-- engine with a single-transaction Postgres function. The delete and insert
-- commit together or roll back together, so a failed/incomplete import can no
-- longer leave an account with its previous holdings wiped and nothing to
-- replace them.
--
-- SECURITY INVOKER (the default, stated explicitly) so the existing holdings
-- RLS policy `FOR ALL USING (auth.uid() = user_id)` still enforces per-user
-- isolation: the caller may only delete/insert their own rows, and INSERT's
-- WITH CHECK defaults to the USING expression.
--
-- NOTE: apply this by hand in the Supabase Dashboard SQL editor — the project
-- is not CLI-linked.
-- ============================================================================

CREATE OR REPLACE FUNCTION replace_account_holdings(
  p_portfolio_id uuid,
  p_account_id   uuid,
  p_rows         jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM holdings
   WHERE portfolio_id = p_portfolio_id
     AND account_id   = p_account_id;

  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    INSERT INTO holdings (
      user_id, portfolio_id, account_id, company_id, isin,
      quantity, avg_buy_price, sector, source, import_holding_id
    )
    SELECT
      (r->>'user_id')::uuid,
      (r->>'portfolio_id')::uuid,
      (r->>'account_id')::uuid,
      (r->>'company_id')::uuid,
      r->>'isin',
      (r->>'quantity')::numeric,
      (r->>'avg_buy_price')::numeric,
      nullif(r->>'sector', ''),
      r->>'source',
      (r->>'import_holding_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION replace_account_holdings(uuid, uuid, jsonb) TO authenticated;
