-- ============================================================================
-- 005_tradebook.sql — Raw trade storage + FIFO lot matching
-- ----------------------------------------------------------------------------
-- Apply manually via Supabase Dashboard SQL editor.
-- Run the table creation block first, then the function block after.
-- ============================================================================

-- ============================================================================
-- trades — raw, immutable broker trade executions
-- ============================================================================
CREATE TABLE trades (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  symbol              TEXT NOT NULL,
  isin                TEXT NOT NULL,
  trade_date          DATE NOT NULL,
  exchange            TEXT NOT NULL DEFAULT 'NSE',
  segment             TEXT NOT NULL DEFAULT 'EQ',
  series              TEXT,
  trade_type          TEXT NOT NULL CHECK (trade_type IN ('buy', 'sell')),
  is_auction          BOOLEAN NOT NULL DEFAULT false,
  quantity            NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
  price               NUMERIC(15,4) NOT NULL CHECK (price >= 0),
  broker_trade_id     TEXT NOT NULL,
  broker_order_id     TEXT,
  executed_at         TIMESTAMPTZ,
  stock_id            UUID REFERENCES indian_stocks(id),
  import_tradebook_id UUID,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, broker_trade_id)
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trades"
  ON trades FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_trades_user         ON trades(user_id);
CREATE INDEX idx_trades_account_date ON trades(account_id, trade_date);
CREATE INDEX idx_trades_user_isin    ON trades(user_id, isin, trade_date);
CREATE INDEX idx_trades_stock        ON trades(stock_id) WHERE stock_id IS NOT NULL;
CREATE INDEX idx_trades_import       ON trades(import_tradebook_id) WHERE import_tradebook_id IS NOT NULL;

-- ============================================================================
-- import_tradebooks — one row per file import (audit log)
-- ============================================================================
CREATE TABLE import_tradebooks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  broker         TEXT NOT NULL,
  client_id      TEXT,
  date_from      DATE,
  date_to        DATE,
  file_name      TEXT,
  status         TEXT NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('completed', 'failed', 'partial')),
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count  INTEGER NOT NULL DEFAULT 0,
  error_count    INTEGER NOT NULL DEFAULT 0,
  total_rows     INTEGER NOT NULL DEFAULT 0,
  errors         JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE import_tradebooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own import_tradebooks"
  ON import_tradebooks FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_import_tradebooks_user    ON import_tradebooks(user_id);
CREATE INDEX idx_import_tradebooks_account ON import_tradebooks(account_id);

-- Add FK now that import_tradebooks exists
ALTER TABLE trades ADD CONSTRAINT trades_import_tradebook_id_fkey
  FOREIGN KEY (import_tradebook_id) REFERENCES import_tradebooks(id) ON DELETE SET NULL;

-- ============================================================================
-- trade_lot_matches — pre-computed FIFO matching (recomputed on new import)
-- ============================================================================
CREATE TABLE trade_lot_matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stock_id         UUID REFERENCES indian_stocks(id),
  isin             TEXT NOT NULL,
  buy_trade_id     UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  sell_trade_id    UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  matched_quantity NUMERIC(15,4) NOT NULL CHECK (matched_quantity > 0),
  buy_date         DATE NOT NULL,
  sell_date        DATE NOT NULL,
  buy_price        NUMERIC(15,4) NOT NULL,
  sell_price       NUMERIC(15,4) NOT NULL,
  realized_pnl     NUMERIC(15,4) NOT NULL,
  holding_days     INTEGER NOT NULL,
  is_intraday      BOOLEAN NOT NULL DEFAULT false,
  is_long_term     BOOLEAN NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trade_lot_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade_lot_matches"
  ON trade_lot_matches FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_lot_matches_account   ON trade_lot_matches(account_id);
CREATE INDEX idx_lot_matches_user_isin ON trade_lot_matches(user_id, isin);
CREATE INDEX idx_lot_matches_sell_date ON trade_lot_matches(account_id, sell_date);
CREATE INDEX idx_lot_matches_buy_trade ON trade_lot_matches(buy_trade_id);
CREATE INDEX idx_lot_matches_sell_year
  ON trade_lot_matches(user_id, date_trunc('year', sell_date));

-- ============================================================================
-- get_open_positions(p_account_ids uuid[])
-- Returns open positions (FIFO-derived) for the calling user.
-- p_account_ids = NULL means all accounts.
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
-- get_open_lots_for_stock(p_isin text, p_account_ids uuid[])
-- Returns per-lot detail for one stock (lazy-loaded on row expand).
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
    AND  (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
    AND  t.quantity   > COALESCE(s.sold_qty, 0)
  ORDER  BY t.trade_date ASC, t.executed_at ASC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION get_open_lots_for_stock(text, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- POST-APPLY VERIFICATION:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('trades','import_tradebooks','trade_lot_matches');
-- ---------------------------------------------------------------------------
