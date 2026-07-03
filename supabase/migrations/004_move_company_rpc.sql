-- ============================================================================
-- Atomic company move
-- ----------------------------------------------------------------------------
-- Replaces the non-transactional move in `moveCompany`: it inserted the target
-- company, reconciled holdings, then deep-copied every research child record
-- across ~10 separate statements, and finally deleted the source. A failure at
-- any step left a half-copied company alongside a (possibly) deleted original.
--
-- This function does the entire move — insert target company, reconcile
-- holdings (creating the account when needed), copy projection_models +
-- financial_years + valuation_scenarios + timeline_entries +
-- segment_valuations + market_perceptions, then delete the source — inside one
-- transaction. Everything commits together or rolls back together. It also owns
-- the duplicate-stock and account-required checks, raising them as errors the
-- caller surfaces verbatim.
--
-- SECURITY INVOKER (the default, stated explicitly) so every table's RLS policy
-- `FOR ALL USING (auth.uid() = user_id)` keeps enforcing per-user isolation:
-- the caller may only read/insert/delete their own rows, and each INSERT's
-- WITH CHECK defaults to the USING expression. A company/portfolio that isn't
-- the caller's is simply invisible → "not found".
--
-- NOTE: apply this by hand in the Supabase Dashboard SQL editor — the project
-- is not CLI-linked.
-- ============================================================================

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
  v_target_type   text;
  v_new_company   uuid;
  v_account_id    uuid;
  v_new_label     text;
BEGIN
  -- 1. Source company (RLS restricts this to the caller's own rows).
  SELECT * INTO v_source FROM companies WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  v_user_id := v_source.user_id;
  v_isin    := v_source.isin;

  -- 2. Target portfolio type.
  SELECT type INTO v_target_type FROM portfolios WHERE id = p_target_portfolio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target portfolio not found';
  END IF;

  -- 3. Reject a duplicate stock already in the target portfolio.
  IF EXISTS (
    SELECT 1 FROM companies
     WHERE portfolio_id = p_target_portfolio_id
       AND isin = v_isin
  ) THEN
    RAISE EXCEPTION 'This stock already exists in the target portfolio.';
  END IF;

  -- 4. Insert the target company (research fields only; positions live in `holdings`).
  INSERT INTO companies (
    portfolio_id, user_id, isin, buy_price, star_rating, strategy,
    investment_horizon_years, expected_returns, thesis, highlights, notes
  ) VALUES (
    p_target_portfolio_id, v_user_id, v_isin, v_source.buy_price, v_source.star_rating,
    v_source.strategy, v_source.investment_horizon_years, v_source.expected_returns,
    v_source.thesis, v_source.highlights, p_notes
  )
  RETURNING id INTO v_new_company;

  -- 4b. Reconcile holdings for the move.
  IF v_target_type = 'watchlist' THEN
    -- Moving out of holdings — unlink by dropping every position.
    DELETE FROM holdings WHERE company_id = p_company_id;
  ELSIF EXISTS (SELECT 1 FROM holdings WHERE company_id = p_company_id) THEN
    -- Existing positions move with the stock, keeping their own accounts.
    UPDATE holdings
       SET company_id  = v_new_company,
           portfolio_id = p_target_portfolio_id
     WHERE company_id = p_company_id;
  ELSE
    -- No position to carry — an account is required to create the initial
    -- (possibly zero-qty) holding so the company belongs to an account.
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
      user_id, portfolio_id, account_id, company_id, isin,
      quantity, avg_buy_price, source, import_holding_id
    ) VALUES (
      v_user_id, p_target_portfolio_id, v_account_id, v_new_company, v_isin,
      coalesce(p_quantity, 0), coalesce(p_avg_buy_price, 0), 'manual', NULL
    );
  END IF;

  -- 5. Copy research child records. projection_models first so financial_years
  --    and valuation_scenarios can be remapped to the new model ids via the
  --    (company_id, projection_type) unique key.
  INSERT INTO projection_models (
    company_id, user_id, projection_type, name, is_default, sort_order
  )
  SELECT v_new_company, user_id, projection_type, name, is_default, sort_order
    FROM projection_models
   WHERE company_id = p_company_id;

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
  JOIN projection_models npm
    ON npm.company_id = v_new_company
   AND npm.projection_type = opm.projection_type
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
  JOIN projection_models npm
    ON npm.company_id = v_new_company
   AND npm.projection_type = opm.projection_type
  WHERE vs.company_id = p_company_id;

  INSERT INTO timeline_entries (
    company_id, user_id, quarter, entry_date, content, sort_order
  )
  SELECT v_new_company, user_id, quarter, entry_date, content, sort_order
    FROM timeline_entries
   WHERE company_id = p_company_id;

  INSERT INTO segment_valuations (
    company_id, user_id, segment_name, management_signal, metrics, multiple,
    estimated_value, sort_order
  )
  SELECT v_new_company, user_id, segment_name, management_signal, metrics, multiple,
         estimated_value, sort_order
    FROM segment_valuations
   WHERE company_id = p_company_id;

  INSERT INTO market_perceptions (
    company_id, user_id, perception, own_view, sort_order
  )
  SELECT v_new_company, user_id, perception, own_view, sort_order
    FROM market_perceptions
   WHERE company_id = p_company_id;

  -- 6. Delete the source company (CASCADE removes its remaining children).
  DELETE FROM companies WHERE id = p_company_id;

  RETURN v_new_company;
END;
$$;

GRANT EXECUTE ON FUNCTION move_company(uuid, uuid, text, uuid, text, numeric, numeric) TO authenticated;
