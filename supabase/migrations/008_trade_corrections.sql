-- ============================================================================
-- 008_trade_corrections.sql — Manual trade corrections (review & correct UI)
-- ----------------------------------------------------------------------------
-- Apply manually via the Supabase Dashboard SQL editor.
--
-- Adds three columns to `trades` supporting the hybrid correction model:
--   source   — 'zerodha' (imported broker row) | 'manual' (user-entered lot)
--   excluded — soft-delete; hidden from FIFO/reads, row persists so a reimport
--              (idempotent upsert, never deletes) can't resurrect it
--   original — JSONB snapshot of a broker row taken on first edit; NULL if never
--              edited. Powers the "edited" badge and reset-to-original.
--
-- Manual rows use broker_trade_id = 'manual-' || gen_random_uuid(), which
-- satisfies UNIQUE(account_id, broker_trade_id) and never collides on reimport.
--
-- NOTE: the live read/FIFO paths derive positions in application code
-- (deriveRemainingLots / recomputeFifoForAccount), which filter excluded=false.
-- The SQL functions below are re-created with the same filter for defense in
-- depth (they are currently not called via RPC).
-- ============================================================================

ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS source   TEXT    NOT NULL DEFAULT 'zerodha'
    CHECK (source IN ('zerodha', 'manual')),
  ADD COLUMN IF NOT EXISTS excluded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original JSONB;

-- Hot path: open, non-excluded lots for an account.
CREATE INDEX IF NOT EXISTS idx_trades_account_active
  ON trades(account_id) WHERE excluded = false;

-- ============================================================================
-- Re-create get_open_positions with `AND t.excluded = false`
-- ============================================================================
CREATE OR REPLACE FUNCTION get_open_positions(p_account_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  isin           TEXT,
  stock_id       UUID,
  symbol         TEXT,
  name           TEXT,
  sector         TEXT,
  quantity       NUMERIC,
  avg_buy_price  NUMERIC,
  current_price  NUMERIC,
  unrealized_pnl NUMERIC,
  pnl_pct        NUMERIC
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH sold AS (
    SELECT tlm.buy_trade_id, SUM(tlm.matched_quantity) AS sold_qty
    FROM   trade_lot_matches tlm
    WHERE  tlm.user_id = auth.uid()
      AND  (p_account_ids IS NULL OR tlm.account_id = ANY(p_account_ids))
    GROUP  BY tlm.buy_trade_id
  ),
  open_buys AS (
    SELECT
      t.isin,
      t.stock_id,
      t.symbol,
      t.quantity - COALESCE(s.sold_qty, 0) AS remaining_qty,
      t.price                               AS buy_price
    FROM   trades t
    LEFT   JOIN sold s ON t.id = s.buy_trade_id
    WHERE  t.user_id    = auth.uid()
      AND  t.trade_type = 'buy'
      AND  t.excluded   = false
      AND  (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
      AND  t.quantity > COALESCE(s.sold_qty, 0)
  )
  SELECT
    ob.isin,
    ob.stock_id,
    COALESCE(ist.nse_symbol, ob.symbol)          AS symbol,
    ist.name,
    ist.sector,
    SUM(ob.remaining_qty)                        AS quantity,
    SUM(ob.remaining_qty * ob.buy_price)
      / NULLIF(SUM(ob.remaining_qty), 0)         AS avg_buy_price,
    ist.price                                    AS current_price,
    CASE WHEN ist.price IS NOT NULL
         THEN (ist.price - SUM(ob.remaining_qty * ob.buy_price)
                           / NULLIF(SUM(ob.remaining_qty), 0))
              * SUM(ob.remaining_qty)
         ELSE NULL END                           AS unrealized_pnl,
    CASE WHEN ist.price IS NOT NULL
           AND SUM(ob.remaining_qty * ob.buy_price) > 0
         THEN (ist.price - SUM(ob.remaining_qty * ob.buy_price)
                           / NULLIF(SUM(ob.remaining_qty), 0))
              / (SUM(ob.remaining_qty * ob.buy_price)
                 / NULLIF(SUM(ob.remaining_qty), 0)) * 100
         ELSE NULL END                           AS pnl_pct
  FROM   open_buys ob
  LEFT   JOIN indian_stocks ist ON ob.stock_id = ist.id
  GROUP  BY ob.isin, ob.stock_id, ist.nse_symbol, ob.symbol,
            ist.name, ist.sector, ist.price
  ORDER  BY SUM(ob.remaining_qty) DESC;
$$;

GRANT EXECUTE ON FUNCTION get_open_positions(uuid[]) TO authenticated;

-- ============================================================================
-- Re-create get_open_lots_for_stock with `AND t.excluded = false`
-- ============================================================================
CREATE OR REPLACE FUNCTION get_open_lots_for_stock(
  p_isin        TEXT,
  p_account_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  account_id      UUID,
  account_label   TEXT,
  broker          TEXT,
  trade_date      DATE,
  original_qty    NUMERIC,
  remaining_qty   NUMERIC,
  buy_price       NUMERIC,
  current_price   NUMERIC,
  unrealized_pnl  NUMERIC,
  pnl_pct         NUMERIC,
  holding_days    INTEGER,
  cagr            NUMERIC,
  broker_trade_id TEXT
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH sold AS (
    SELECT tlm.buy_trade_id, SUM(tlm.matched_quantity) AS sold_qty
    FROM   trade_lot_matches tlm
    WHERE  tlm.user_id = auth.uid()
      AND  tlm.isin    = p_isin
      AND  (p_account_ids IS NULL OR tlm.account_id = ANY(p_account_ids))
    GROUP  BY tlm.buy_trade_id
  ),
  price_row AS (
    SELECT ist.price
    FROM   indian_stocks ist
    JOIN   trades t2 ON t2.stock_id = ist.id
    WHERE  t2.user_id = auth.uid()
      AND  t2.isin = p_isin
    LIMIT  1
  )
  SELECT
    t.id,
    t.account_id,
    a.label                                              AS account_label,
    a.broker,
    t.trade_date,
    t.quantity                                           AS original_qty,
    t.quantity - COALESCE(s.sold_qty, 0)                 AS remaining_qty,
    t.price                                              AS buy_price,
    p.price                                              AS current_price,
    CASE WHEN p.price IS NOT NULL
         THEN (p.price - t.price)
              * (t.quantity - COALESCE(s.sold_qty, 0))
         ELSE NULL END                                   AS unrealized_pnl,
    CASE WHEN p.price IS NOT NULL AND t.price > 0
         THEN (p.price - t.price) / t.price * 100
         ELSE NULL END                                   AS pnl_pct,
    (CURRENT_DATE - t.trade_date)::INTEGER               AS holding_days,
    CASE
      WHEN p.price IS NOT NULL
       AND t.price > 0
       AND (CURRENT_DATE - t.trade_date)::INTEGER >= 7
      THEN (POWER(p.price / t.price,
                  365.0 / NULLIF((CURRENT_DATE - t.trade_date)::NUMERIC, 0)
            ) - 1) * 100
      ELSE NULL
    END                                                  AS cagr,
    t.broker_trade_id
  FROM   trades t
  LEFT   JOIN sold s ON t.id = s.buy_trade_id
  JOIN   accounts a ON a.id = t.account_id
  CROSS  JOIN price_row p
  WHERE  t.user_id    = auth.uid()
    AND  t.isin       = p_isin
    AND  t.trade_type = 'buy'
    AND  t.excluded   = false
    AND  (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
    AND  t.quantity   > COALESCE(s.sold_qty, 0)
  ORDER  BY t.trade_date ASC, t.executed_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_open_lots_for_stock(text, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'trades' AND column_name IN ('source','excluded','original');
-- ---------------------------------------------------------------------------
