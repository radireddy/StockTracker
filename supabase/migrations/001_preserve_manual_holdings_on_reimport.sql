-- ============================================================================
-- Preserve manually-entered holdings across statement re-imports
-- ----------------------------------------------------------------------------
-- Previously `replace_account_holdings` deleted EVERY holding for the
-- (portfolio, account) — including `source = 'manual'` rows — before inserting
-- the statement. A manual position living in a broker account was therefore
-- silently wiped on the next re-import if its stock dropped out of the new
-- statement (or its ISIN changed after a split/corporate action).
--
-- New semantics:
--   * Imported (source <> 'manual') holdings for the account are always cleared
--     and rebuilt from the statement (the statement is authoritative for them).
--   * Manual holdings are deleted ONLY when the incoming statement also carries
--     that company (the broker's live figure supersedes the manual edit).
--   * Manual holdings for companies NOT in the statement are preserved.
--
-- Idempotent: re-importing the same file yields the same end state. Still atomic
-- (delete + insert in one transaction) and SECURITY INVOKER so RLS applies.
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
  DELETE FROM holdings h
   WHERE h.portfolio_id = p_portfolio_id
     AND h.account_id   = p_account_id
     AND (
       h.source <> 'manual'
       OR h.company_id IN (
         SELECT (r->>'company_id')::uuid
           FROM jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) AS r
       )
     );

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
