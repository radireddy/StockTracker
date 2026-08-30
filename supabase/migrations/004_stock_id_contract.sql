-- ============================================================================
-- 004_stock_id_contract.sql — Stable stock identity, PHASE D (CONTRACT)
-- ----------------------------------------------------------------------------
-- Run ONLY after Phase C is deployed and 002 + 002b + 003 are applied. Tightens
-- the schema so `stock_id` is the real identity:
--   * stock_id NOT NULL on companies + holdings
--   * indian_stocks PRIMARY KEY moves from `isin` to the surrogate `id`
--   * the companies.isin FK is swapped for stock_id FKs — ATOMICALLY, so the
--     committed schema goes straight from "one FK (isin)" to "one FK (stock_id)"
--     with no two-FK window. PostgREST's implicit `indian_stocks(...)` embeds
--     therefore keep resolving (via whichever single FK exists), so NO app read
--     code needs explicit hints.
--   * "one stock per portfolio" uniqueness moves to (portfolio_id, stock_id)
--   * isin stays as a maintained, unique, denormalized attribute
--   * RPCs carry stock_id
--
-- Backward compatible: the sync trigger (002) still fills stock_id from isin, so
-- even pre-Phase-C code satisfies the new NOT NULL and reads keep working.
--
-- Apply ONCE, in one transaction, in the Supabase Dashboard SQL editor.
-- ============================================================================

BEGIN;

-- 0. Pre-flight: refuse to tighten if any stock_id is still unpopulated.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE stock_id IS NULL)
     OR EXISTS (SELECT 1 FROM holdings WHERE stock_id IS NULL) THEN
    RAISE EXCEPTION 'stock_id backfill incomplete — run 002 (and verify) before 004';
  END IF;
END $$;

-- 1. Require stock_id going forward.
ALTER TABLE companies ALTER COLUMN stock_id SET NOT NULL;
ALTER TABLE holdings  ALTER COLUMN stock_id SET NOT NULL;

-- 2. Move the catalog PRIMARY KEY from isin -> the surrogate id.
--    (Drop the isin FK first so the isin PK is no longer referenced.)
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_isin_fkey;
ALTER TABLE indian_stocks DROP CONSTRAINT indian_stocks_pkey;             -- was PRIMARY KEY (isin)
ALTER TABLE indian_stocks ADD CONSTRAINT indian_stocks_pkey PRIMARY KEY USING INDEX idx_indian_stocks_id;
-- isin remains NOT NULL (every stock has one) but is now a plain unique attribute.
CREATE UNIQUE INDEX IF NOT EXISTS idx_indian_stocks_isin ON indian_stocks (isin);

-- 3. Add the stock_id FKs (id is now the PK → valid target). Committed state now
--    has exactly ONE companies->indian_stocks FK (stock_id): plain embeds resolve.
ALTER TABLE companies ADD CONSTRAINT companies_stock_id_fkey
  FOREIGN KEY (stock_id) REFERENCES indian_stocks(id);
ALTER TABLE holdings ADD CONSTRAINT holdings_stock_id_fkey
  FOREIGN KEY (stock_id) REFERENCES indian_stocks(id);

-- 4. "One stock per portfolio" now keyed on the surrogate.
DROP INDEX IF EXISTS idx_companies_portfolio_isin;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_portfolio_stock ON companies (portfolio_id, stock_id);

-- 5. replace_account_holdings — insert stock_id explicitly (trigger still fills
--    it from isin if a caller omits it). Manual-holding preservation unchanged.
CREATE OR REPLACE FUNCTION replace_account_holdings(
  p_portfolio_id uuid, p_account_id uuid, p_rows jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
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
      user_id, portfolio_id, account_id, company_id, stock_id, isin,
      quantity, avg_buy_price, sector, source, import_holding_id
    )
    SELECT
      (r->>'user_id')::uuid, (r->>'portfolio_id')::uuid, (r->>'account_id')::uuid,
      (r->>'company_id')::uuid, (r->>'stock_id')::uuid, r->>'isin',
      (r->>'quantity')::numeric, (r->>'avg_buy_price')::numeric,
      nullif(r->>'sector', ''), r->>'source', (r->>'import_holding_id')::uuid
    FROM jsonb_array_elements(p_rows) AS r;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION replace_account_holdings(uuid, uuid, jsonb) TO authenticated;

-- 6. move_company — carry stock_id and reject duplicates by stock_id (so a stock
--    already held under a DIFFERENT ISIN is still caught). Everything else is
--    unchanged from the 000 definition.
CREATE OR REPLACE FUNCTION move_company(
  p_company_id          uuid,
  p_target_portfolio_id uuid,
  p_notes               text    DEFAULT NULL,
  p_account_id          uuid    DEFAULT NULL,
  p_new_account_label   text    DEFAULT NULL,
  p_quantity            numeric DEFAULT NULL,
  p_avg_buy_price       numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_source        companies%ROWTYPE;
  v_user_id       uuid;
  v_isin          text;
  v_stock_id      uuid;
  v_target_type   text;
  v_new_company   uuid;
  v_account_id    uuid;
  v_new_label     text;
BEGIN
  SELECT * INTO v_source FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  v_user_id  := v_source.user_id;
  v_isin     := v_source.isin;
  v_stock_id := v_source.stock_id;

  SELECT type INTO v_target_type FROM portfolios WHERE id = p_target_portfolio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target portfolio not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM companies
     WHERE portfolio_id = p_target_portfolio_id AND stock_id = v_stock_id
  ) THEN
    RAISE EXCEPTION 'This stock already exists in the target portfolio.';
  END IF;

  INSERT INTO companies (
    portfolio_id, user_id, stock_id, isin, buy_price, star_rating, strategy,
    investment_horizon_years, expected_returns, thesis, highlights, notes
  ) VALUES (
    p_target_portfolio_id, v_user_id, v_stock_id, v_isin, v_source.buy_price, v_source.star_rating,
    v_source.strategy, v_source.investment_horizon_years, v_source.expected_returns,
    v_source.thesis, v_source.highlights, p_notes
  )
  RETURNING id INTO v_new_company;

  IF v_target_type = 'watchlist' THEN
    DELETE FROM holdings WHERE company_id = p_company_id;
  ELSIF EXISTS (SELECT 1 FROM holdings WHERE company_id = p_company_id) THEN
    UPDATE holdings
       SET company_id = v_new_company, portfolio_id = p_target_portfolio_id
     WHERE company_id = p_company_id;
  ELSE
    v_new_label := btrim(coalesce(p_new_account_label, ''));
    IF v_new_label <> '' THEN
      BEGIN
        INSERT INTO accounts (user_id, label, broker)
        VALUES (v_user_id, v_new_label, 'manual')
        RETURNING id INTO v_account_id;
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'An account named "%" already exists', v_new_label;
      END;
    ELSIF p_account_id IS NOT NULL THEN
      v_account_id := p_account_id;
    ELSE
      RAISE EXCEPTION 'Select an account to move this stock into holdings.';
    END IF;

    INSERT INTO holdings (
      user_id, portfolio_id, account_id, company_id, stock_id, isin,
      quantity, avg_buy_price, source, import_holding_id
    ) VALUES (
      v_user_id, p_target_portfolio_id, v_account_id, v_new_company, v_stock_id, v_isin,
      coalesce(p_quantity, 0), coalesce(p_avg_buy_price, 0), 'manual', NULL
    );
  END IF;

  INSERT INTO projection_models (company_id, user_id, projection_type, name, is_default, sort_order)
  SELECT v_new_company, user_id, projection_type, name, is_default, sort_order
    FROM projection_models WHERE company_id = p_company_id;

  INSERT INTO financial_years (
    company_id, projection_model_id, user_id, year, is_estimate, revenue,
    revenue_growth_pct, ebitda, ebitda_margin_pct, ebitda_growth_pct, depreciation,
    finance_cost, other_income, exceptional_items, pbt, tax_pct, pat, pat_growth_pct,
    pat_margin_pct, minority_interest, pat_for_shareholders, pe, peg, net_debt,
    lease_liability, total_debt, ev_ebitda_ratio, sort_order
  )
  SELECT
    v_new_company, npm.id, fy.user_id, fy.year, fy.is_estimate, fy.revenue,
    fy.revenue_growth_pct, fy.ebitda, fy.ebitda_margin_pct, fy.ebitda_growth_pct,
    fy.depreciation, fy.finance_cost, fy.other_income, fy.exceptional_items, fy.pbt,
    fy.tax_pct, fy.pat, fy.pat_growth_pct, fy.pat_margin_pct, fy.minority_interest,
    fy.pat_for_shareholders, fy.pe, fy.peg, fy.net_debt, fy.lease_liability,
    fy.total_debt, fy.ev_ebitda_ratio, fy.sort_order
  FROM financial_years fy
  JOIN projection_models opm ON opm.id = fy.projection_model_id
  JOIN projection_models npm ON npm.company_id = v_new_company AND npm.projection_type = opm.projection_type
  WHERE fy.company_id = p_company_id;

  INSERT INTO valuation_scenarios (
    company_id, projection_model_id, user_id, scenario_type, target_pe,
    target_market_cap, irr, buying_market_cap, buy_price, target_ev_ebitda_ratio,
    expected_ev, net_debt_terminal
  )
  SELECT
    v_new_company, npm.id, vs.user_id, vs.scenario_type, vs.target_pe,
    vs.target_market_cap, vs.irr, vs.buying_market_cap, vs.buy_price,
    vs.target_ev_ebitda_ratio, vs.expected_ev, vs.net_debt_terminal
  FROM valuation_scenarios vs
  JOIN projection_models opm ON opm.id = vs.projection_model_id
  JOIN projection_models npm ON npm.company_id = v_new_company AND npm.projection_type = opm.projection_type
  WHERE vs.company_id = p_company_id;

  INSERT INTO timeline_entries (company_id, user_id, quarter, entry_date, content, sort_order)
  SELECT v_new_company, user_id, quarter, entry_date, content, sort_order
    FROM timeline_entries WHERE company_id = p_company_id;

  INSERT INTO segment_valuations (
    company_id, user_id, segment_name, management_signal, metrics, multiple, estimated_value, sort_order
  )
  SELECT v_new_company, user_id, segment_name, management_signal, metrics, multiple, estimated_value, sort_order
    FROM segment_valuations WHERE company_id = p_company_id;

  INSERT INTO market_perceptions (company_id, user_id, perception, own_view, sort_order)
  SELECT v_new_company, user_id, perception, own_view, sort_order
    FROM market_perceptions WHERE company_id = p_company_id;

  DELETE FROM companies WHERE id = p_company_id;
  RETURN v_new_company;
END;
$$;
GRANT EXECUTE ON FUNCTION move_company(uuid, uuid, text, uuid, text, numeric, numeric) TO authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION:
--   -- id is the PK, isin is unique-but-not-PK:
--   SELECT conname, contype FROM pg_constraint WHERE conrelid = 'indian_stocks'::regclass;
--   -- exactly ONE companies->indian_stocks FK (stock_id):
--   SELECT conname FROM pg_constraint WHERE conrelid='companies'::regclass AND contype='f';
--   -- reads still work (HTTP 200):
--   GET /rest/v1/companies?select=id,isin,indian_stocks(name,price)&limit=1
-- ---------------------------------------------------------------------------
