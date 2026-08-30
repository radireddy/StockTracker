# Tradebook Import & Trades Dashboard — Design Spec

**Date:** 2026-08-30  
**Status:** Approved for implementation  
**Scope:** MVP — import Zerodha tradebook, derive open positions via FIFO, show trades dashboard at `/trades`

---

## 1. Goals

1. Allow users to import a Zerodha tradebook XLSX and persist raw trades.
2. Compute open positions (stocks not yet fully sold) from trades via FIFO.
3. Show a `/trades` dashboard — same visual design as the existing `/dashboard` — but data sourced from FIFO-derived positions, not from the `holdings` table.
4. The existing `/dashboard` and all holdings functionality must be untouched.
5. Re-importing the same file any number of times produces the same result (idempotent).
6. Support multiple broker accounts (same broker or different brokers) per user.

---

## 2. Out of Scope (MVP)

- AI chat / natural language queries  
- XIRR, CAGR, capital gains reports  
- Corporate action adjustments (splits, bonuses)  
- Groww / other broker parsers (adapter pattern is ready; parsers are not)  
- Historical valuation charts  
- Realized P&L view  
- Intraday P&L breakdown (stored in `trade_lot_matches.is_intraday`, but not surfaced in the UI yet)

---

## 3. Database Schema

Three new tables. Applied as `supabase/migrations/005_tradebook.sql` (applied manually via Dashboard).

### 3.1 `trades`

Raw, immutable trade rows. One row per broker trade execution. Never updated after insert.

```sql
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
  import_tradebook_id UUID REFERENCES import_tradebooks(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, broker_trade_id)
);

ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trades" ON trades FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_trades_user         ON trades(user_id);
CREATE INDEX idx_trades_account_date ON trades(account_id, trade_date);
CREATE INDEX idx_trades_user_isin    ON trades(user_id, isin, trade_date);
CREATE INDEX idx_trades_stock        ON trades(stock_id) WHERE stock_id IS NOT NULL;
CREATE INDEX idx_trades_import       ON trades(import_tradebook_id);
```

**Idempotency:** `UNIQUE(account_id, broker_trade_id)` — inserting the same trade twice silently skips the duplicate (`ON CONFLICT DO NOTHING`). `imported_count` tracks new rows; `skipped_count` tracks conflicts.

### 3.2 `import_tradebooks`

One row per file import. Audit log.

```sql
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
```

### 3.3 `trade_lot_matches`

Pre-computed FIFO matching. Deleted and recomputed for the account whenever new trades are inserted. This is the primary data source for all P&L analytics (now and in the long-term roadmap).

```sql
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
```

**`is_intraday`:** `buy_date = sell_date`.  
**`is_long_term`:** `holding_days >= 365 AND NOT is_intraday`.  
**`realized_pnl`:** `(sell_price - buy_price) × matched_quantity`.

---

## 4. Existing `accounts` Table — Reused As-Is

No schema changes to `accounts`. A tradebook account is identified the same way as a holdings account: `(user_id, broker, client_id)`. The import engine auto-creates an account if `client_id` is new, or reuses an existing one.

---

## 5. Import Flow

### 5.1 Zerodha Tradebook File Format

Sheet: `Equity`  
Header metadata rows (rows 6–14):
- Row 6: `Client ID | XD6134`
- Row 10: `Tradebook for Equity from YYYY-MM-DD to YYYY-MM-DD`
- Row 14 (data header): `Symbol | ISIN | Trade Date | Exchange | Segment | Series | Trade Type | Auction | Quantity | Price | Trade ID | Order ID | Order Execution Time`
- Rows 15+: data

Trade Type values: `"buy"` or `"sell"` (lowercase).

### 5.2 Parser — `ZerodhaTradebookAdapter`

File: `src/lib/import/zerodha-tradebook-parser.ts`

Implements the same `TradebookAdapter` interface used for all brokers:

```typescript
interface ParsedTrade {
  symbol: string;
  isin: string;
  trade_date: string;      // YYYY-MM-DD
  exchange: string;
  segment: string;
  series: string | null;
  trade_type: 'buy' | 'sell';
  is_auction: boolean;
  quantity: number;
  price: number;
  broker_trade_id: string;
  broker_order_id: string | null;
  executed_at: string | null;  // ISO timestamp
}

interface TradebookParseResult {
  trades: ParsedTrade[];
  metadata: TradebookMetadata;
  errors: ParseError[];
}

interface TradebookMetadata {
  broker: BrokerType;
  client_id: string | null;
  account_label: string | null;
  date_from: string | null;   // YYYY-MM-DD
  date_to: string | null;
}
```

**Detection** (`canParse`): `Equity` sheet exists AND (`"Tradebook for Equity"` found in the first 15 rows OR data header row contains a `"Trade ID"` column). The holdings parser checks for `"Holdings Statement"` — these two are mutually exclusive so there's no ambiguity at detection time.

**Parsing:** Skip rows where quantity ≤ 0. Skip non-equity segments (segment ≠ `'EQ'`). Parse `executed_at` as ISO timestamp.

### 5.3 Import Engine — `executeTradebookImport`

File: `src/lib/import/tradebook-import-engine.ts`

```
1. Parse file → ParsedTrade[] via adapter
2. Resolve/create account from (broker, client_id)
3. Create import_tradebooks row (status='partial' initially)
4. Resolve stocks: same resolveStocks() used by holdings engine
5. Bulk INSERT trades ON CONFLICT (account_id, broker_trade_id) DO NOTHING
   → count imported_count and skipped_count from result
6. If imported_count > 0:
   a. DELETE FROM trade_lot_matches WHERE account_id = ?
   b. Load all trades for this account (ordered by isin, trade_date, executed_at)
   c. Run FIFO engine in memory → lot match rows
   d. Bulk INSERT trade_lot_matches
7. Update import_tradebooks row (status='completed', counts, errors)
8. Return TradebookImportResult
```

**If imported_count = 0** (pure re-import, all trades already existed): skip steps 6a–6d entirely. Lot matches are unchanged. Cost: one SELECT + one count, < 10ms.

### 5.4 FIFO Algorithm

File: `src/lib/import/fifo-engine.ts`

Input: all `trades` for one account, sorted by `(isin, trade_date ASC, executed_at ASC)`.  
Output: `LotMatch[]` rows ready for bulk insert.

```
For each ISIN independently:
  1. Separate intraday: any (isin, trade_date) where both buys and sells exist on that date.
     Match intraday sells against intraday buys first (FIFO within the day).
  2. Remaining buys → delivery buy queue (FIFO: oldest first).
  3. Remaining delivery sells → match against delivery buy queue (oldest lot first).
  4. Partial lot matches are allowed (one buy lot can be split across multiple sells).

Output per match:
  { buy_trade_id, sell_trade_id, matched_quantity,
    buy_date, sell_date, buy_price, sell_price,
    realized_pnl: (sell_price - buy_price) × matched_quantity,
    holding_days: sell_date - buy_date,
    is_intraday: buy_date === sell_date,
    is_long_term: holding_days >= 365 && !is_intraday }
```

**Open positions** are derived at query time — trades with no lot match row, or with `matched_quantity < trade.quantity`.

### 5.5 Open Positions Query

Used by the trades dashboard. No stored table — computed from `trades` + `trade_lot_matches`:

```sql
WITH sold AS (
  SELECT buy_trade_id, SUM(matched_quantity) AS sold_qty
  FROM trade_lot_matches
  WHERE user_id = $1
  GROUP BY buy_trade_id
)
SELECT
  t.isin,
  t.stock_id,
  SUM(t.quantity - COALESCE(s.sold_qty, 0))        AS quantity,
  SUM((t.quantity - COALESCE(s.sold_qty, 0)) * t.price)
    / SUM(t.quantity - COALESCE(s.sold_qty, 0))     AS avg_buy_price
FROM trades t
LEFT JOIN sold s ON t.id = s.buy_trade_id
WHERE t.user_id = $1
  AND t.trade_type = 'buy'
  AND t.quantity > COALESCE(s.sold_qty, 0)
GROUP BY t.isin, t.stock_id
```

When an account filter is active, `AND account_id = ANY($2)` is added to **both** the `sold` CTE and the outer `WHERE` clause. Filtering only the outer query would leave the sold quantities unfiltered, producing incorrect remaining quantities for multi-account users.

---

## 6. Server Actions & API

### Actions

| File | Functions |
|------|-----------|
| `src/app/(authenticated)/actions/tradebook-actions.ts` | `importTradebook(formData)`, `getTradeImportHistory()`, `deleteTradeImport(id)` |
| `src/app/(authenticated)/actions/trades-actions.ts` | `getOpenPositions(accountIds?)`, `getTradesForStock(isin)` |

`importTradebook` is the primary entry point:
- Reads `user_id` from `auth.uid()` — never from form data
- Calls `executeTradebookImport`
- Returns `ActionResult<TradebookImportResult>`

### API Route

`src/app/api/tradebook/route.ts`  
- `POST /api/tradebook` — import (multipart/form-data, `file` field)  
- `GET /api/tradebook` — list import history  
- `DELETE /api/tradebook?id=<id>` — delete one import record (not the trades)

---

## 7. Trades Dashboard

### Route

`src/app/(authenticated)/trades/page.tsx`

### Data Hook

`src/hooks/use-trades-data.ts`  
- Calls `getOpenPositions(accountIds?)`  
- Returns positions joined with `indian_stocks` (name, sector) and current price from `indian_stocks.price`  
- Same SWR/React Query caching pattern as `use-dashboard-data.ts`

### UI Components

| Component | Notes |
|-----------|-------|
| `src/components/trades/trades-table.tsx` | Mirror of `companies-table.tsx` — same columns (symbol, name, qty, avg cost, current price, P&L, P&L %) |
| `src/components/trades/trades-pnl-bar.tsx` | Mirror of `portfolio-pnl-bar.tsx` — total invested, current value, unrealized P&L |
| `src/components/trades/trade-import-button.tsx` | Upload button + import history drawer |

**No research data shown** (no star ratings, thesis, strategy). The table shows broker-derived position data only.

**Account filter:** Reuses existing `AccountFilter` component. Filters positions by `account_id`.

### Navigation

Add "Trades" nav item to `src/components/layout/` sidebar/nav (next to "Dashboard"). Route: `/trades`.

---

## 8. Import UI

Integrated into the `/trades` page (not a separate page):

- "Import Tradebook" button → file picker (`.xlsx`)  
- Adapter auto-detects broker from file content (`canParse`)  
- Shows result modal: imported N trades, skipped M (already existed)  
- Import history list: date, broker, account, counts, errors  
- Delete import record (removes the `import_tradebooks` row only — does **not** delete trades or recompute FIFO)

---

## 9. Security

- `user_id` on every table, RLS enabled with `auth.uid() = user_id` policy  
- `user_id` injected from `auth.uid()` in every server action — never from client payload  
- All SQL uses parameterized queries (Supabase JS client; no string concatenation)  
- `UNIQUE(account_id, broker_trade_id)` prevents duplicate inserts even under concurrent imports  
- Parsed numeric fields (`quantity`, `price`) validated > 0 before insert  
- File size limit: 10MB (same as existing import)  
- Trade count limit: 10,000 trades per file (`MAX_TRADES_PER_IMPORT`) — prevents memory exhaustion in FIFO engine

---

## 10. File Map

```
supabase/migrations/
  005_tradebook.sql

src/lib/import/
  zerodha-tradebook-parser.ts   (new)
  tradebook-import-engine.ts    (new)
  fifo-engine.ts                (new)
  tradebook-types.ts            (new — ParsedTrade, TradebookAdapter, etc.)

src/app/(authenticated)/
  trades/
    page.tsx                    (new — trades dashboard)
  actions/
    tradebook-actions.ts        (new)
    trades-actions.ts           (new)

src/app/api/tradebook/
  route.ts                      (new)

src/hooks/
  use-trades-data.ts            (new)

src/components/trades/
  trades-table.tsx              (new)
  trades-pnl-bar.tsx            (new)
  trade-import-button.tsx       (new)

src/__tests__/
  zerodha-tradebook-parser.test.ts   (new)
  fifo-engine.test.ts                (new)
  tradebook-import-engine.test.ts    (new)
```

---

## 11. Testing

- **`fifo-engine.test.ts`:** Pure function unit tests. Scenarios: simple FIFO order, intraday detection, partial lot match, sell exceeds buy (error), multiple ISINs independent, re-import idempotency (0 new trades → lot matches unchanged).  
- **`zerodha-tradebook-parser.test.ts`:** Parses real file structure. Client ID extraction, date range extraction, buy/sell rows, skipped rows (zero qty, non-EQ segment), `canParse` detection.  
- **`tradebook-import-engine.test.ts`:** Integration with Supabase mock. First import, re-import same file (skipped_count = total, no FIFO recompute), second file with new trades.  
- Coverage gate: same 95% threshold as rest of codebase.

---

## 12. Long-Term Schema Compatibility

The three MVP tables are designed to support the full MProfit-like roadmap without migration:

| Future feature | Uses |
|---------------|------|
| Realized P&L report | `trade_lot_matches` GROUP BY isin/year |
| STCG/LTCG capital gains | `is_long_term` + `is_intraday` flags |
| XIRR for any period | `trades` cash flows + current price |
| Best year / sector stats | `trade_lot_matches` GROUP BY sell_year / join indian_stocks.sector |
| AI tools (future) | All 10 tools query these same tables |
| Multi-broker | Adapter pattern ready; add parser per broker |
| Corporate actions | `corporate_actions` table to be added separately |
