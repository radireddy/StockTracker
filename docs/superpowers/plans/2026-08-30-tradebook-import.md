# Tradebook Import & Trades Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import Zerodha broker tradebooks, compute open positions via FIFO, and display a `/trades` dashboard mirroring the existing holdings dashboard.

**Architecture:** Raw trades are stored immutably in `trades` (idempotent on `account_id + broker_trade_id`). On each import that inserts new rows, a pure in-memory FIFO engine recomputes `trade_lot_matches` for that account. The `/trades` dashboard derives open positions from those two tables at query time — no separate stored state.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), TypeScript, xlsx (already installed), Vitest, TanStack Query, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-08-30-tradebook-import-design.md`

## Global Constraints

- All new tables have `user_id` with `RLS USING (auth.uid() = user_id)`.
- `user_id` is **always** injected from `auth.uid()` in server actions — never from client/form data.
- All SQL uses parameterized queries via the Supabase JS client — no string concatenation.
- Migration `005_tradebook.sql` is applied manually via Supabase Dashboard SQL editor (project is not linked to Supabase CLI).
- Test coverage threshold: 95% (existing `vitest.config.ts` gate). New files must meet it.
- Existing `/dashboard` and all holdings code is untouched.
- Maximum 10,000 trades per import file (`MAX_TRADES_PER_IMPORT = 10_000`).
- CAGR hidden for lots held fewer than 7 days.
- File size limit: 10 MB (same as holdings import).

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `supabase/migrations/005_tradebook.sql` | **create** | 3 new tables + RLS + indexes |
| `src/lib/import/tradebook-types.ts` | **create** | All tradebook TS types & interfaces |
| `src/lib/import/fifo-engine.ts` | **create** | Pure FIFO algorithm (intraday + delivery) |
| `src/lib/import/zerodha-tradebook-parser.ts` | **create** | Zerodha XLSX tradebook parser |
| `src/lib/import/tradebook-broker-registry.ts` | **create** | Auto-detect tradebook adapter from file |
| `src/lib/import/tradebook-import-engine.ts` | **create** | Orchestrates insert → FIFO recompute → audit |
| `src/app/(authenticated)/actions/tradebook-actions.ts` | **create** | `importTradebook`, `getTradeImportHistory`, `deleteTradeImport` |
| `src/app/(authenticated)/actions/trades-actions.ts` | **create** | `getOpenPositions`, `getOpenLotsForStock` |
| `src/app/api/tradebook/route.ts` | **create** | REST API (POST/GET/DELETE) |
| `src/hooks/use-trades-data.ts` | **create** | TanStack Query hook for open positions |
| `src/components/trades/trades-pnl-bar.tsx` | **create** | Summary bar (invested / current value / P&L) |
| `src/components/trades/trades-table.tsx` | **create** | Expandable positions table |
| `src/components/trades/open-lots-panel.tsx` | **create** | Per-lot detail panel (lazy-loaded) |
| `src/components/trades/trade-import-button.tsx` | **create** | Upload trigger + import history drawer |
| `src/app/(authenticated)/trades/page.tsx` | **create** | `/trades` dashboard page |
| `src/components/layout/` (sidebar/nav) | **modify** | Add "Trades" nav item |
| `src/__tests__/lib/fifo-engine.test.ts` | **create** | Unit tests for FIFO algorithm |
| `src/__tests__/lib/zerodha-tradebook-parser.test.ts` | **create** | Unit tests for parser |
| `src/__tests__/lib/tradebook-import-engine.test.ts` | **create** | Integration tests for import engine |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/005_tradebook.sql`

**Interfaces:**
- Produces: `trades`, `import_tradebooks`, `trade_lot_matches` tables available in Supabase.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/005_tradebook.sql
-- Apply manually via Supabase Dashboard SQL editor.

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
  import_tradebook_id UUID REFERENCES import_tradebooks(id) ON DELETE SET NULL,
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
CREATE INDEX idx_trades_import       ON trades(import_tradebook_id);

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
```

- [ ] **Step 2: Apply via Supabase Dashboard**

  Open the Supabase Dashboard → SQL editor → paste the file → run. Verify all three tables appear in the Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/005_tradebook.sql
git commit -m "feat(db): 005 tradebook — trades, import_tradebooks, trade_lot_matches"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/lib/import/tradebook-types.ts`

**Interfaces:**
- Consumes: `BrokerType`, `ParseError` from `./types`
- Produces: `ParsedTrade`, `TradebookMetadata`, `TradebookParseResult`, `TradebookAdapter`, `RawTradeForFifo`, `LotMatch`, `TradebookImportResult`, `OpenPosition`, `OpenLot`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/import/tradebook-types.ts
import type { BrokerType, ParseError } from "./types";

export type { ParseError };

/** One trade row parsed from a broker tradebook file. */
export interface ParsedTrade {
  symbol: string;
  isin: string;
  trade_date: string;        // YYYY-MM-DD
  exchange: string;
  segment: string;
  series: string | null;
  trade_type: "buy" | "sell";
  is_auction: boolean;
  quantity: number;
  price: number;
  broker_trade_id: string;
  broker_order_id: string | null;
  executed_at: string | null; // ISO timestamp or null
}

export interface TradebookMetadata {
  broker: BrokerType;
  client_id: string | null;
  account_label: string | null;
  date_from: string | null;  // YYYY-MM-DD
  date_to: string | null;    // YYYY-MM-DD
}

export interface TradebookParseResult {
  trades: ParsedTrade[];
  metadata: TradebookMetadata;
  errors: ParseError[];
}

/** Interface every broker tradebook adapter must implement. */
export interface TradebookAdapter {
  readonly broker: BrokerType;
  readonly displayName: string;
  readonly acceptedFileTypes: string;
  readonly description: string;
  canParse(buffer: ArrayBuffer): boolean;
  parse(buffer: ArrayBuffer): TradebookParseResult;
}

/** Shape the FIFO engine receives — hydrated with DB-assigned UUIDs. */
export interface RawTradeForFifo {
  id: string;           // UUID assigned by the DB
  isin: string;
  stock_id: string | null;
  trade_date: string;   // YYYY-MM-DD
  trade_type: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string | null;
}

/** One FIFO-matched buy↔sell pairing, ready for bulk insert. */
export interface LotMatch {
  user_id: string;
  account_id: string;
  stock_id: string | null;
  isin: string;
  buy_trade_id: string;
  sell_trade_id: string;
  matched_quantity: number;
  buy_date: string;
  sell_date: string;
  buy_price: number;
  sell_price: number;
  realized_pnl: number;
  holding_days: number;
  is_intraday: boolean;
  is_long_term: boolean;
}

/** Returned by the import engine after processing one file. */
export interface TradebookImportResult {
  status: "completed" | "failed" | "partial";
  account_id: string;
  account_label: string;
  imported_count: number;   // new rows inserted
  skipped_count: number;    // already existed (idempotent)
  error_count: number;
  total_rows: number;
  date_from: string | null;
  date_to: string | null;
  errors: Array<{ row?: number; symbol?: string; message: string }>;
}

/** One open position row returned by getOpenPositions(). */
export interface OpenPosition {
  isin: string;
  stock_id: string | null;
  symbol: string;
  name: string | null;
  sector: string | null;
  quantity: number;
  avg_buy_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  pnl_pct: number | null;
}

/** One open lot row returned by getOpenLotsForStock(). */
export interface OpenLot {
  id: string;
  account_id: string;
  account_label: string;
  broker: string;
  trade_date: string;
  original_qty: number;
  remaining_qty: number;
  buy_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  pnl_pct: number | null;
  holding_days: number;
  /** null when holding_days < 7 */
  cagr: number | null;
  broker_trade_id: string;
}

export const MAX_TRADES_PER_IMPORT = 10_000;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/import/tradebook-types.ts
git commit -m "feat(import): tradebook type definitions"
```

---

## Task 3: FIFO Engine + Tests

**Files:**
- Create: `src/lib/import/fifo-engine.ts`
- Create: `src/__tests__/lib/fifo-engine.test.ts`

**Interfaces:**
- Consumes: `RawTradeForFifo`, `LotMatch` from `./tradebook-types`
- Produces: `computeFifoMatches(input: FifoInput): LotMatch[]`

```typescript
interface FifoInput {
  userId: string;
  accountId: string;
  /** All trades for this account across all ISINs. The engine groups internally. */
  trades: RawTradeForFifo[];
}
```

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/lib/fifo-engine.test.ts
import { describe, it, expect } from "vitest";
import { computeFifoMatches } from "@/lib/import/fifo-engine";
import type { RawTradeForFifo } from "@/lib/import/tradebook-types";

const USER = "user-1";
const ACC  = "acc-1";

function trade(
  id: string,
  isin: string,
  date: string,
  type: "buy" | "sell",
  qty: number,
  price: number,
  executedAt?: string
): RawTradeForFifo {
  return {
    id,
    isin,
    stock_id: null,
    trade_date: date,
    trade_type: type,
    quantity: qty,
    price,
    executed_at: executedAt ?? null,
  };
}

describe("computeFifoMatches — delivery", () => {
  it("matches one sell against one buy (full match)", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy",  100, 100),
      trade("s1", "INE001", "2024-06-01", "sell", 100, 150),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.buy_trade_id).toBe("b1");
    expect(m.sell_trade_id).toBe("s1");
    expect(m.matched_quantity).toBe(100);
    expect(m.realized_pnl).toBeCloseTo((150 - 100) * 100);
    expect(m.holding_days).toBe(152);
    expect(m.is_intraday).toBe(false);
    expect(m.is_long_term).toBe(false); // < 365 days
  });

  it("matches sell against oldest buy first (FIFO order)", () => {
    const trades = [
      trade("b1", "INE001", "2023-01-01", "buy", 50, 100),
      trade("b2", "INE001", "2023-06-01", "buy", 50, 200),
      trade("s1", "INE001", "2024-01-15", "sell", 60, 250),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    // b1 fully consumed (50 shares), b2 partially consumed (10 shares)
    expect(matches).toHaveLength(2);
    const m1 = matches.find((m) => m.buy_trade_id === "b1")!;
    const m2 = matches.find((m) => m.buy_trade_id === "b2")!;
    expect(m1.matched_quantity).toBe(50);
    expect(m2.matched_quantity).toBe(10);
  });

  it("marks is_long_term when holding_days >= 365", () => {
    const trades = [
      trade("b1", "INE001", "2022-01-01", "buy",  100, 100),
      trade("s1", "INE001", "2023-06-01", "sell", 100, 200),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches[0].is_long_term).toBe(true);
    expect(matches[0].holding_days).toBeGreaterThanOrEqual(365);
  });

  it("leaves unmatched buy lots (open positions) out of matches", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy", 100, 100),
      // no sell
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches).toHaveLength(0);
  });

  it("handles partial sell — remaining buy stays open", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy",  200, 100),
      trade("s1", "INE001", "2024-06-01", "sell",  80, 150),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches).toHaveLength(1);
    expect(matches[0].matched_quantity).toBe(80);
    // remaining 120 shares from b1 are open — no second match row
  });

  it("processes multiple ISINs independently", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy",  100, 100),
      trade("s1", "INE001", "2024-06-01", "sell", 100, 150),
      trade("b2", "INE002", "2024-02-01", "buy",   50, 200),
      trade("s2", "INE002", "2024-07-01", "sell",  50, 300),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.isin).sort()).toEqual(["INE001", "INE002"]);
  });

  it("uses executed_at for ordering when two buys share the same date", () => {
    const trades = [
      trade("b2", "INE001", "2024-01-01", "buy", 50, 200, "2024-01-01T10:00:00Z"),
      trade("b1", "INE001", "2024-01-01", "buy", 50, 100, "2024-01-01T09:00:00Z"),
      trade("s1", "INE001", "2024-06-01", "sell", 50, 150),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    // b1 executed earlier → consumed first
    expect(matches[0].buy_trade_id).toBe("b1");
    expect(matches[0].buy_price).toBe(100);
  });
});

describe("computeFifoMatches — intraday", () => {
  it("marks same-day buy+sell as intraday", () => {
    const trades = [
      trade("b1", "INE001", "2024-03-15", "buy",  100, 100),
      trade("s1", "INE001", "2024-03-15", "sell", 100, 110),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches).toHaveLength(1);
    expect(matches[0].is_intraday).toBe(true);
    expect(matches[0].holding_days).toBe(0);
    expect(matches[0].is_long_term).toBe(false);
  });

  it("intraday buy leftover becomes delivery lot for future sells", () => {
    const trades = [
      trade("b1", "INE001", "2024-03-15", "buy",  200, 100),
      trade("s1", "INE001", "2024-03-15", "sell",  50, 110), // intraday: 50 matched
      trade("s2", "INE001", "2024-09-01", "sell", 100, 130), // delivery: uses remaining 150
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    const intraday = matches.filter((m) => m.is_intraday);
    const delivery = matches.filter((m) => !m.is_intraday);
    expect(intraday).toHaveLength(1);
    expect(intraday[0].matched_quantity).toBe(50);
    expect(delivery).toHaveLength(1);
    expect(delivery[0].matched_quantity).toBe(100);
    expect(delivery[0].buy_trade_id).toBe("b1");
  });

  it("intraday sell exceeding same-day buys falls through to delivery queue", () => {
    // Buy 50 intraday, also have 100 in delivery queue from earlier
    const trades = [
      trade("b0", "INE001", "2024-01-01", "buy",  100,  80), // delivery queue
      trade("b1", "INE001", "2024-03-15", "buy",   50, 100), // intraday buy
      trade("s1", "INE001", "2024-03-15", "sell", 120, 110), // 50 intraday + 70 delivery
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    const intraday = matches.filter((m) => m.is_intraday);
    const delivery = matches.filter((m) => !m.is_intraday);
    expect(intraday[0].matched_quantity).toBe(50);
    expect(delivery[0].matched_quantity).toBe(70);
    expect(delivery[0].buy_trade_id).toBe("b0");
  });
});

describe("computeFifoMatches — realized_pnl", () => {
  it("computes realized_pnl correctly", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy",  300, 120),
      trade("s1", "INE001", "2024-06-01", "sell", 300, 180),
    ];
    const [m] = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(m.realized_pnl).toBeCloseTo((180 - 120) * 300); // 18000
  });

  it("propagates user_id and account_id onto matches", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy",  100, 100),
      trade("s1", "INE001", "2024-06-01", "sell", 100, 150),
    ];
    const [m] = computeFifoMatches({ userId: "u-abc", accountId: "a-xyz", trades });
    expect(m.user_id).toBe("u-abc");
    expect(m.account_id).toBe("a-xyz");
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test -- src/__tests__/lib/fifo-engine.test.ts
```

Expected: all tests fail with "computeFifoMatches is not a function".

- [ ] **Step 3: Implement the FIFO engine**

```typescript
// src/lib/import/fifo-engine.ts
import type { RawTradeForFifo, LotMatch } from "./tradebook-types";

export interface FifoInput {
  userId: string;
  accountId: string;
  trades: RawTradeForFifo[];
}

export function computeFifoMatches({ userId, accountId, trades }: FifoInput): LotMatch[] {
  const matches: LotMatch[] = [];

  // Group trades by ISIN
  const byIsin = new Map<string, RawTradeForFifo[]>();
  for (const t of trades) {
    const list = byIsin.get(t.isin) ?? [];
    list.push(t);
    byIsin.set(t.isin, list);
  }

  for (const [isin, isinTrades] of byIsin) {
    // Sort globally by execution time (or trade_date as fallback)
    const sorted = [...isinTrades].sort((a, b) => {
      const ta = a.executed_at ?? `${a.trade_date}T00:00:00Z`;
      const tb = b.executed_at ?? `${b.trade_date}T00:00:00Z`;
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });

    // Group by date to detect intraday days
    const byDate = new Map<string, { buys: RawTradeForFifo[]; sells: RawTradeForFifo[] }>();
    for (const t of sorted) {
      const day = byDate.get(t.trade_date) ?? { buys: [], sells: [] };
      t.trade_type === "buy" ? day.buys.push(t) : day.sells.push(t);
      byDate.set(t.trade_date, day);
    }

    // Delivery queue: buy lots that survive the day (including leftover intraday buys)
    const deliveryQueue: Array<{ trade: RawTradeForFifo; remaining: number }> = [];

    for (const date of [...byDate.keys()].sort()) {
      const { buys, sells } = byDate.get(date)!;
      const isIntraday = buys.length > 0 && sells.length > 0;

      if (isIntraday) {
        const intradayBuys = buys.map((t) => ({ trade: t, remaining: t.quantity }));

        for (const sell of sells) {
          let sellRemaining = sell.quantity;

          // Match against same-day buys first
          for (const lot of intradayBuys) {
            if (sellRemaining <= 0 || lot.remaining <= 0) continue;
            const matched = Math.min(lot.remaining, sellRemaining);
            lot.remaining -= matched;
            sellRemaining -= matched;
            matches.push(
              buildMatch(userId, accountId, isin, lot.trade, sell, matched, true)
            );
          }

          // Overflow: match remaining sell against delivery queue
          if (sellRemaining > 0) {
            sellRemaining = drainDeliveryQueue(
              deliveryQueue, sell, sellRemaining,
              userId, accountId, isin, matches
            );
          }
        }

        // Leftover intraday buys → enter delivery queue (chronological insert)
        for (const lot of intradayBuys) {
          if (lot.remaining > 0) {
            deliveryQueue.push({ trade: lot.trade, remaining: lot.remaining });
          }
        }
      } else if (buys.length > 0) {
        for (const t of buys) deliveryQueue.push({ trade: t, remaining: t.quantity });
      } else {
        for (const sell of sells) {
          drainDeliveryQueue(deliveryQueue, sell, sell.quantity, userId, accountId, isin, matches);
        }
      }
    }
  }

  return matches;
}

function drainDeliveryQueue(
  queue: Array<{ trade: RawTradeForFifo; remaining: number }>,
  sell: RawTradeForFifo,
  sellRemaining: number,
  userId: string,
  accountId: string,
  isin: string,
  matches: LotMatch[]
): number {
  for (const lot of queue) {
    if (sellRemaining <= 0 || lot.remaining <= 0) continue;
    const matched = Math.min(lot.remaining, sellRemaining);
    lot.remaining -= matched;
    sellRemaining -= matched;
    matches.push(buildMatch(userId, accountId, isin, lot.trade, sell, matched, false));
  }
  return sellRemaining;
}

function buildMatch(
  userId: string,
  accountId: string,
  isin: string,
  buy: RawTradeForFifo,
  sell: RawTradeForFifo,
  matchedQty: number,
  isIntraday: boolean
): LotMatch {
  const buyDate  = new Date(buy.trade_date);
  const sellDate = new Date(sell.trade_date);
  const holdingDays = Math.round(
    (sellDate.getTime() - buyDate.getTime()) / 86_400_000
  );
  return {
    user_id: userId,
    account_id: accountId,
    stock_id: buy.stock_id,
    isin,
    buy_trade_id: buy.id,
    sell_trade_id: sell.id,
    matched_quantity: matchedQty,
    buy_date: buy.trade_date,
    sell_date: sell.trade_date,
    buy_price: buy.price,
    sell_price: sell.price,
    realized_pnl: (sell.price - buy.price) * matchedQty,
    holding_days: holdingDays,
    is_intraday: isIntraday,
    is_long_term: !isIntraday && holdingDays >= 365,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/__tests__/lib/fifo-engine.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/import/fifo-engine.ts src/__tests__/lib/fifo-engine.test.ts
git commit -m "feat(import): FIFO engine with intraday detection"
```

---

## Task 4: Zerodha Tradebook Parser + Tests

**Files:**
- Create: `src/lib/import/zerodha-tradebook-parser.ts`
- Create: `src/lib/import/tradebook-broker-registry.ts`
- Create: `src/__tests__/lib/zerodha-tradebook-parser.test.ts`

**Interfaces:**
- Consumes: `TradebookAdapter`, `TradebookParseResult`, `ParsedTrade`, `MAX_TRADES_PER_IMPORT` from `./tradebook-types`; `XLSX` from `xlsx`
- Produces: `zerodhaTradebookAdapter` (exported const), `detectTradebookBroker(buffer)` (from registry)

- [ ] **Step 1: Write failing parser tests**

```typescript
// src/__tests__/lib/zerodha-tradebook-parser.test.ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { zerodhaTradebookAdapter } from "@/lib/import/zerodha-tradebook-parser";

/** Build a minimal Zerodha tradebook ArrayBuffer in memory. */
function buildZerodhaTradebook(
  rows: Array<[string, string, string, string, string, string, string, boolean, number, number, string, string, string]>,
  clientId = "XD6134",
  dateFrom = "2026-04-01",
  dateTo = "2026-08-30"
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const data: unknown[][] = [
    [], [], [], [], [], // rows 0-4 blank
    ["Client ID", clientId],                                   // row 5
    [], [], [],                                                // rows 6-8 blank
    [`Tradebook for Equity from ${dateFrom} to ${dateTo}`],    // row 9
    [], [], [], [],                                            // rows 10-13 blank (row 13 = header row index 13)
    // data header at row index 13:
    ["Symbol","ISIN","Trade Date","Exchange","Segment","Series","Trade Type","Auction","Quantity","Price","Trade ID","Order ID","Order Execution Time"],
    // data rows:
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Equity");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf as ArrayBuffer;
}

describe("zerodhaTradebookAdapter.canParse", () => {
  it("returns true for a valid Zerodha tradebook", () => {
    const buf = buildZerodhaTradebook([]);
    expect(zerodhaTradebookAdapter.canParse(buf)).toBe(true);
  });

  it("returns false for a Zerodha holdings file (no Tradebook header)", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Client ID", "XD6134"],
      ["Equity Holdings Statement as on 2026-03-31"],
      ["Symbol","ISIN","Quantity Available"],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Equity");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect(zerodhaTradebookAdapter.canParse(buf)).toBe(false);
  });
});

describe("zerodhaTradebookAdapter.parse — metadata", () => {
  it("extracts client_id from the header row", () => {
    const buf = buildZerodhaTradebook([]);
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.client_id).toBe("XD6134");
  });

  it("extracts date_from and date_to from the Tradebook header", () => {
    const buf = buildZerodhaTradebook([], "XD6134", "2025-04-01", "2026-03-31");
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.date_from).toBe("2025-04-01");
    expect(metadata.date_to).toBe("2026-03-31");
  });

  it("sets account_label to '<clientId> (Zerodha)'", () => {
    const buf = buildZerodhaTradebook([]);
    const { metadata } = zerodhaTradebookAdapter.parse(buf);
    expect(metadata.account_label).toBe("XD6134 (Zerodha)");
  });
});

describe("zerodhaTradebookAdapter.parse — trades", () => {
  it("parses a buy trade correctly", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-04-01","NSE","EQ","EQ","buy",false,199,1355,"200083793","1100000000307034","2026-04-01T09:06:11"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    const t = trades[0];
    expect(t.symbol).toBe("GRAVITA");
    expect(t.isin).toBe("INE024L01027");
    expect(t.trade_date).toBe("2026-04-01");
    expect(t.trade_type).toBe("buy");
    expect(t.quantity).toBe(199);
    expect(t.price).toBe(1355);
    expect(t.broker_trade_id).toBe("200083793");
    expect(t.broker_order_id).toBe("1100000000307034");
    expect(t.is_auction).toBe(false);
  });

  it("parses a sell trade correctly", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-05-01","NSE","EQ","EQ","sell",false,100,1500,"200083800","1100000000307099","2026-05-01T14:30:00"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades[0].trade_type).toBe("sell");
  });

  it("skips rows with quantity 0", () => {
    const buf = buildZerodhaTradebook([
      ["GRAVITA","INE024L01027","2026-04-01","NSE","EQ","EQ","buy",false,0,1355,"TID1","OID1","2026-04-01T09:00:00"],
      ["HDFC","INE040A01034","2026-04-02","NSE","EQ","EQ","buy",false,10,1400,"TID2","OID2","2026-04-02T09:00:00"],
    ]);
    const { trades, errors } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("HDFC");
    expect(errors.some((e) => e.symbol === "GRAVITA")).toBe(true);
  });

  it("skips rows where segment is not EQ", () => {
    const buf = buildZerodhaTradebook([
      ["NIFTY24NOV","","2026-04-01","NSE","FO","","buy",false,50,22000,"TID1","OID1","2026-04-01T09:00:00"],
      ["RELIANCE","INE002A01018","2026-04-02","NSE","EQ","EQ","buy",false,10,2900,"TID2","OID2","2026-04-02T09:00:00"],
    ]);
    const { trades } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("RELIANCE");
  });

  it("returns an error when file has > MAX_TRADES_PER_IMPORT rows", () => {
    const rows = Array.from({ length: 10_001 }, (_, i) => [
      "SYM", "INE001A01036", "2026-04-01", "NSE", "EQ", "EQ", "buy", false, 1, 100, `TID${i}`, `OID${i}`, "2026-04-01T09:00:00",
    ] as [string, string, string, string, string, string, string, boolean, number, number, string, string, string]);
    const buf = buildZerodhaTradebook(rows);
    const { trades, errors } = zerodhaTradebookAdapter.parse(buf);
    expect(trades).toHaveLength(0);
    expect(errors.some((e) => e.severity === "error" && e.message.includes("10,000"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test -- src/__tests__/lib/zerodha-tradebook-parser.test.ts
```

Expected: all fail with "module not found".

- [ ] **Step 3: Implement the parser**

```typescript
// src/lib/import/zerodha-tradebook-parser.ts
import * as XLSX from "xlsx";
import type { TradebookAdapter, TradebookParseResult, ParsedTrade } from "./tradebook-types";
import { MAX_TRADES_PER_IMPORT } from "./tradebook-types";
import type { ParseError } from "./types";

export const zerodhaTradebookAdapter: TradebookAdapter = {
  broker: "zerodha",
  displayName: "Zerodha (Kite/Console)",
  acceptedFileTypes: ".xlsx,.xls",
  description:
    "Upload your tradebook from Zerodha Console (Reports > Tradebook > Download as Excel)",

  canParse(buffer: ArrayBuffer): boolean {
    try {
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames.find((s) => s.toLowerCase() === "equity");
      if (!sheetName) return false;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        defval: null,
      });
      const head = rows.slice(0, 20);
      const hasTradebook = head.some(
        (r) =>
          Array.isArray(r) &&
          typeof r[0] === "string" &&
          r[0].toLowerCase().includes("tradebook for equity")
      );
      const hasTradeIdCol = head.some(
        (r) => Array.isArray(r) && r.includes("Trade ID")
      );
      // Explicitly exclude holdings files
      const isHoldings = head.some(
        (r) =>
          Array.isArray(r) &&
          typeof r[0] === "string" &&
          r[0].toLowerCase().includes("holdings statement")
      );
      return !isHoldings && (hasTradebook || hasTradeIdCol);
    } catch {
      return false;
    }
  },

  parse(buffer: ArrayBuffer): TradebookParseResult {
    const wb = XLSX.read(buffer, { type: "array" });
    const errors: ParseError[] = [];
    const emptyMeta = {
      broker: "zerodha" as const,
      client_id: null,
      account_label: null,
      date_from: null,
      date_to: null,
    };

    const sheetName = wb.SheetNames.find((s) => s.toLowerCase() === "equity");
    if (!sheetName) {
      return {
        trades: [],
        metadata: emptyMeta,
        errors: [{ message: "No 'Equity' sheet found.", severity: "error" }],
      };
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
    });

    // Extract metadata from first 20 rows
    let clientId: string | null = null;
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i] as unknown[];
      if (!row) continue;
      const c0 = String(row[0] ?? "").trim();
      if (c0 === "Client ID" && row[1] != null) {
        clientId = String(row[1]).trim();
      }
      const m = c0.match(
        /tradebook for equity from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i
      );
      if (m) { dateFrom = m[1]; dateTo = m[2]; }
    }

    const metadata = {
      broker: "zerodha" as const,
      client_id: clientId,
      account_label: clientId ? `${clientId} (Zerodha)` : null,
      date_from: dateFrom,
      date_to: dateTo,
    };

    // Find data header row
    const headerIdx = rows.findIndex(
      (r) => Array.isArray(r) && r[0] === "Symbol" && r.includes("Trade ID")
    );
    if (headerIdx < 0) {
      return {
        trades: [],
        metadata,
        errors: [{ message: "Could not find the trade table header.", severity: "error" }],
      };
    }

    const header = (rows[headerIdx] as unknown[]).map((c) => String(c ?? "").trim());
    const col = (name: string) => header.indexOf(name);
    const iSymbol   = col("Symbol");
    const iIsin     = col("ISIN");
    const iDate     = col("Trade Date");
    const iExchange = col("Exchange");
    const iSegment  = col("Segment");
    const iSeries   = col("Series");
    const iType     = col("Trade Type");
    const iAuction  = col("Auction");
    const iQty      = col("Quantity");
    const iPrice    = col("Price");
    const iTradeId  = col("Trade ID");
    const iOrderId  = col("Order ID");
    const iExecTime = col("Order Execution Time");

    const num = (v: unknown) => {
      const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
      return isNaN(n) ? 0 : n;
    };

    // Count data rows first for the limit check
    const dataRows = rows.slice(headerIdx + 1).filter(
      (r) => Array.isArray(r) && r[iSymbol] != null && String(r[iSymbol]).trim() !== ""
    );
    if (dataRows.length > MAX_TRADES_PER_IMPORT) {
      return {
        trades: [],
        metadata,
        errors: [
          {
            message: `File contains ${dataRows.length.toLocaleString()} trades, exceeding the limit of 10,000 per import. Split the file into smaller date ranges.`,
            severity: "error",
          },
        ],
      };
    }

    const trades: ParsedTrade[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      if (!row || row[iSymbol] == null || String(row[iSymbol]).trim() === "") continue;

      const symbol  = String(row[iSymbol]).trim();
      const segment = String(row[iSegment] ?? "").trim().toUpperCase();
      const qty     = num(row[iQty]);

      if (segment !== "EQ") {
        errors.push({ row: i + 1, symbol, message: `Skipping non-equity segment '${segment}'`, severity: "warning" });
        continue;
      }
      if (qty <= 0) {
        errors.push({ row: i + 1, symbol, message: "Skipping row with zero quantity", severity: "warning" });
        continue;
      }

      const rawDate = row[iDate];
      const tradeDate =
        typeof rawDate === "number"
          ? XLSX.SSF.format("yyyy-mm-dd", rawDate)
          : String(rawDate ?? "").slice(0, 10);

      const rawExecTime = row[iExecTime];
      let executedAt: string | null = null;
      if (rawExecTime != null) {
        executedAt =
          typeof rawExecTime === "number"
            ? new Date((rawExecTime - 25569) * 86400 * 1000).toISOString()
            : String(rawExecTime);
      }

      trades.push({
        symbol,
        isin: String(row[iIsin] ?? "").trim(),
        trade_date: tradeDate,
        exchange: String(row[iExchange] ?? "NSE").trim(),
        segment,
        series: row[iSeries] != null ? String(row[iSeries]).trim() : null,
        trade_type: String(row[iType] ?? "").toLowerCase().trim() as "buy" | "sell",
        is_auction: row[iAuction] === true || String(row[iAuction]).toLowerCase() === "true",
        quantity: qty,
        price: num(row[iPrice]),
        broker_trade_id: String(row[iTradeId] ?? "").trim(),
        broker_order_id: row[iOrderId] != null ? String(row[iOrderId]).trim() : null,
        executed_at: executedAt,
      });
    }

    return { trades, metadata, errors };
  },
};
```

- [ ] **Step 4: Create the tradebook broker registry**

```typescript
// src/lib/import/tradebook-broker-registry.ts
import type { TradebookAdapter } from "./tradebook-types";
import { zerodhaTradebookAdapter } from "./zerodha-tradebook-parser";

const adapters: TradebookAdapter[] = [zerodhaTradebookAdapter];

export function detectTradebookBroker(buffer: ArrayBuffer): TradebookAdapter | null {
  return adapters.find((a) => a.canParse(buffer)) ?? null;
}

export function getAllTradebookAdapters(): TradebookAdapter[] {
  return [...adapters];
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npm test -- src/__tests__/lib/zerodha-tradebook-parser.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/zerodha-tradebook-parser.ts \
        src/lib/import/tradebook-broker-registry.ts \
        src/__tests__/lib/zerodha-tradebook-parser.test.ts
git commit -m "feat(import): Zerodha tradebook parser + broker registry"
```

---

## Task 5: Tradebook Import Engine + Tests

**Files:**
- Create: `src/lib/import/tradebook-import-engine.ts`
- Create: `src/__tests__/lib/tradebook-import-engine.test.ts`

**Interfaces:**
- Consumes: `TradebookParseResult`, `TradebookImportResult`, `RawTradeForFifo`, `LotMatch`, `MAX_TRADES_PER_IMPORT` from `./tradebook-types`; `computeFifoMatches` from `./fifo-engine`; `resolveStocks` from `@/lib/stocks/resolve-stock`; `createAdminClient` from `@/lib/supabase/admin`; `shouldBackfillClientId`, `resolveAccountId` from `@/lib/accounts`
- Produces: `executeTradebookImport(userId, parseResult, fileName, userSupabase): Promise<TradebookImportResult>`

- [ ] **Step 1: Write failing integration tests**

```typescript
// src/__tests__/lib/tradebook-import-engine.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TradebookParseResult } from "@/lib/import/tradebook-types";

// ── Minimal Supabase mock ──────────────────────────────────────────────
const mockRows: Record<string, unknown[]> = {};
const mockInserted: Record<string, unknown[]> = {};

function makeSupabaseMock() {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
      insert: (rows: unknown[]) => ({
        select: async () => {
          mockInserted[table] = [...(mockInserted[table] ?? []), ...rows];
          return { data: rows.map((r, i) => ({ ...(r as object), id: `mock-id-${table}-${i}` })), error: null };
        },
      }),
      upsert: (rows: unknown[], _opts?: unknown) => ({
        select: async () => {
          const existing = new Set((mockRows[table] ?? []).map((r: unknown) => {
            const row = r as Record<string, unknown>;
            return `${row.account_id}||${row.broker_trade_id}`;
          }));
          const newRows = (rows as Record<string, unknown>[]).filter(
            (r) => !existing.has(`${r.account_id}||${r.broker_trade_id}`)
          );
          mockRows[table] = [...(mockRows[table] ?? []), ...newRows];
          return {
            data: newRows.map((r, i) => ({ ...r, id: `trade-id-${i}` })),
            error: null,
          };
        },
      }),
      delete: () => ({ eq: () => ({ error: null }) }),
      update: (vals: unknown) => ({ eq: () => ({ error: null, data: vals }) }),
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeSupabaseMock(),
}));

vi.mock("@/lib/stocks/resolve-stock", () => ({
  resolveStocks: async (_client: unknown, refs: Array<{ isin: string }>) => {
    const map = new Map<string, { stockId: string; currentIsin: string }>();
    for (const r of refs) map.set(r.isin, { stockId: `stock-${r.isin}`, currentIsin: r.isin });
    return map;
  },
}));

vi.mock("@/lib/accounts", () => ({
  shouldBackfillClientId: () => false,
  resolveAccountId: async () => ({ accountId: "acc-mock", accountLabel: "XD6134 (Zerodha)", isReimport: false }),
}));

import { executeTradebookImport } from "@/lib/import/tradebook-import-engine";

function makeParsed(tradeCount: number, clientId = "XD6134"): TradebookParseResult {
  return {
    trades: Array.from({ length: tradeCount }, (_, i) => ({
      symbol: "GRAVITA",
      isin: "INE024L01027",
      trade_date: "2026-04-01",
      exchange: "NSE",
      segment: "EQ",
      series: "EQ",
      trade_type: "buy" as const,
      is_auction: false,
      quantity: 100,
      price: 1355,
      broker_trade_id: `TID-${i}`,
      broker_order_id: null,
      executed_at: null,
    })),
    metadata: {
      broker: "zerodha",
      client_id: clientId,
      account_label: `${clientId} (Zerodha)`,
      date_from: "2026-04-01",
      date_to: "2026-08-30",
    },
    errors: [],
  };
}

describe("executeTradebookImport", () => {
  beforeEach(() => {
    Object.keys(mockRows).forEach((k) => delete mockRows[k]);
    Object.keys(mockInserted).forEach((k) => delete mockInserted[k]);
  });

  it("returns completed status and imported_count > 0 on first import", async () => {
    const parsed = makeParsed(3);
    const result = await executeTradebookImport("user-1", parsed, "tradebook.xlsx", makeSupabaseMock() as never);
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(3);
    expect(result.skipped_count).toBe(0);
    expect(result.account_id).toBe("acc-mock");
  });

  it("returns skipped_count = total and does not recompute FIFO on pure re-import", async () => {
    const parsed = makeParsed(3);
    // Pre-fill mockRows so all trades appear as existing
    mockRows["trades"] = parsed.trades.map((t, i) => ({
      account_id: "acc-mock",
      broker_trade_id: t.broker_trade_id,
      id: `existing-${i}`,
    }));

    const result = await executeTradebookImport("user-1", parsed, "tradebook.xlsx", makeSupabaseMock() as never);
    expect(result.skipped_count).toBe(3);
    expect(result.imported_count).toBe(0);
    // No lot matches inserted when nothing new
    expect(mockInserted["trade_lot_matches"] ?? []).toHaveLength(0);
  });

  it("records the import in import_tradebooks", async () => {
    const parsed = makeParsed(2);
    await executeTradebookImport("user-1", parsed, "my-file.xlsx", makeSupabaseMock() as never);
    const auditRows = mockInserted["import_tradebooks"] ?? [];
    expect(auditRows.length).toBeGreaterThan(0);
    const audit = auditRows[0] as Record<string, unknown>;
    expect(audit.file_name).toBe("my-file.xlsx");
    expect(audit.broker).toBe("zerodha");
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npm test -- src/__tests__/lib/tradebook-import-engine.test.ts
```

- [ ] **Step 3: Implement the import engine**

```typescript
// src/lib/import/tradebook-import-engine.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStocks } from "@/lib/stocks/resolve-stock";
import { resolveAccountId } from "@/lib/accounts";
import { computeFifoMatches } from "./fifo-engine";
import { createLogger } from "@/lib/logger";
import type {
  TradebookParseResult,
  TradebookImportResult,
  RawTradeForFifo,
  LotMatch,
} from "./tradebook-types";

const log = createLogger({ service: "tradebook-import-engine" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTradebookImport(
  userId: string,
  parseResult: TradebookParseResult,
  fileName: string,
  userSupabase: any
): Promise<TradebookImportResult> {
  const admin = createAdminClient();
  const { trades, metadata, errors: parseErrors } = parseResult;
  const engineErrors: Array<{ row?: number; symbol?: string; message: string }> = [];

  for (const e of parseErrors) {
    if (e.severity === "error") engineErrors.push({ symbol: e.symbol, message: e.message });
  }

  // 1. Resolve / create account ------------------------------------------------
  const { accountId, accountLabel } = await resolveAccountId(
    userId,
    metadata.broker,
    metadata.client_id,
    metadata.account_label,
    null,
    null,
    admin
  );

  // 2. Create import audit row (partial until we know counts) ------------------
  const { data: auditRow, error: auditErr } = await admin
    .from("import_tradebooks")
    .insert({
      user_id: userId,
      account_id: accountId,
      broker: metadata.broker,
      client_id: metadata.client_id,
      date_from: metadata.date_from,
      date_to: metadata.date_to,
      file_name: fileName,
      status: "partial",
      total_rows: trades.length,
      errors: [],
    })
    .select("id")
    .single();

  if (auditErr || !auditRow) {
    log.error("Failed to create import_tradebooks row", { error: auditErr?.message });
    return {
      status: "failed",
      account_id: accountId,
      account_label: accountLabel,
      imported_count: 0,
      skipped_count: 0,
      error_count: 1,
      total_rows: trades.length,
      date_from: metadata.date_from,
      date_to: metadata.date_to,
      errors: [{ message: "Failed to create import record." }],
    };
  }
  const importId: string = auditRow.id;

  // 3. Resolve stocks ----------------------------------------------------------
  const uniqueIsins = [...new Set(trades.map((t) => t.isin))];
  const refs = uniqueIsins.map((isin) => {
    const t = trades.find((x) => x.isin === isin)!;
    return { isin, symbol: t.symbol, sector: null };
  });
  const resolved = await resolveStocks(admin, refs);

  // 4. Bulk insert trades — ON CONFLICT DO NOTHING ----------------------------
  const insertRows = trades.map((t) => ({
    user_id: userId,
    account_id: accountId,
    symbol: t.symbol,
    isin: t.isin,
    trade_date: t.trade_date,
    exchange: t.exchange,
    segment: t.segment,
    series: t.series,
    trade_type: t.trade_type,
    is_auction: t.is_auction,
    quantity: t.quantity,
    price: t.price,
    broker_trade_id: t.broker_trade_id,
    broker_order_id: t.broker_order_id,
    executed_at: t.executed_at,
    stock_id: resolved.get(t.isin)?.stockId ?? null,
    import_tradebook_id: importId,
  }));

  const { data: insertedTrades, error: insertErr } = await admin
    .from("trades")
    .upsert(insertRows, { onConflict: "account_id,broker_trade_id", ignoreDuplicates: true })
    .select("id, isin, trade_date, trade_type, quantity, price, executed_at, stock_id");

  if (insertErr) {
    log.error("Trade insert failed", { error: insertErr.message });
    await admin
      .from("import_tradebooks")
      .update({ status: "failed", errors: [{ message: insertErr.message }] })
      .eq("id", importId);
    return {
      status: "failed",
      account_id: accountId,
      account_label: accountLabel,
      imported_count: 0,
      skipped_count: 0,
      error_count: 1,
      total_rows: trades.length,
      date_from: metadata.date_from,
      date_to: metadata.date_to,
      errors: [{ message: "Database error during trade insert." }],
    };
  }

  const importedCount = insertedTrades?.length ?? 0;
  const skippedCount  = trades.length - importedCount;

  // 5. Recompute FIFO only when new trades were inserted ----------------------
  if (importedCount > 0) {
    // Load all trades for this account for FIFO
    const { data: allTrades, error: fetchErr } = await admin
      .from("trades")
      .select("id, isin, stock_id, trade_date, trade_type, quantity, price, executed_at")
      .eq("account_id", accountId)
      .order("trade_date", { ascending: true });

    if (fetchErr || !allTrades) {
      log.error("Failed to fetch trades for FIFO", { error: fetchErr?.message });
    } else {
      const fifoTrades: RawTradeForFifo[] = allTrades.map((r) => ({
        id: r.id,
        isin: r.isin,
        stock_id: r.stock_id,
        trade_date: r.trade_date,
        trade_type: r.trade_type,
        quantity: Number(r.quantity),
        price: Number(r.price),
        executed_at: r.executed_at,
      }));

      const matches: LotMatch[] = computeFifoMatches({
        userId,
        accountId,
        trades: fifoTrades,
      });

      // Replace lot matches for this account atomically
      await admin.from("trade_lot_matches").delete().eq("account_id", accountId);

      if (matches.length > 0) {
        await admin.from("trade_lot_matches").insert(matches);
      }
    }
  }

  // 6. Finalise audit row -----------------------------------------------------
  const finalErrors = [
    ...engineErrors,
    ...parseErrors
      .filter((e) => e.severity === "warning")
      .map((e) => ({ symbol: e.symbol, message: e.message })),
  ];

  await admin
    .from("import_tradebooks")
    .update({
      status: "completed",
      imported_count: importedCount,
      skipped_count: skippedCount,
      error_count: finalErrors.length,
      errors: finalErrors,
    })
    .eq("id", importId);

  return {
    status: "completed",
    account_id: accountId,
    account_label: accountLabel,
    imported_count: importedCount,
    skipped_count: skippedCount,
    error_count: finalErrors.length,
    total_rows: trades.length,
    date_from: metadata.date_from,
    date_to: metadata.date_to,
    errors: finalErrors,
  };
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npm test -- src/__tests__/lib/tradebook-import-engine.test.ts
```

- [ ] **Step 5: Run full test suite — no regressions**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/import/tradebook-import-engine.ts \
        src/__tests__/lib/tradebook-import-engine.test.ts
git commit -m "feat(import): tradebook import engine — insert trades + FIFO recompute"
```

---

## Task 6: Server Actions

**Files:**
- Create: `src/app/(authenticated)/actions/tradebook-actions.ts`
- Create: `src/app/(authenticated)/actions/trades-actions.ts`

**Interfaces:**
- Consumes: `executeTradebookImport` from `@/lib/import/tradebook-import-engine`; `detectTradebookBroker` from `@/lib/import/tradebook-broker-registry`; `getAuthUser` from `@/lib/supabase/server`; `action`, `ActionResult` from `@/lib/action-result`; `OpenPosition`, `OpenLot`, `TradebookImportResult` from `@/lib/import/tradebook-types`
- Produces: `importTradebook(formData)`, `getTradeImportHistory()`, `deleteTradeImport(id)`, `getOpenPositions(accountIds?)`, `getOpenLotsForStock(isin, accountIds?)`

- [ ] **Step 1: Create tradebook-actions.ts**

```typescript
// src/app/(authenticated)/actions/tradebook-actions.ts
"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { detectTradebookBroker } from "@/lib/import/tradebook-broker-registry";
import { executeTradebookImport } from "@/lib/import/tradebook-import-engine";
import { action, AppError, describeDbError, type ActionResult } from "@/lib/action-result";
import { createLogger } from "@/lib/logger";
import type { TradebookImportResult } from "@/lib/import/tradebook-types";

const log = createLogger({ service: "tradebook-actions" });
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function importTradebook(
  formData: FormData
): Promise<ActionResult<TradebookImportResult>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();

    const file = formData.get("file") as File | null;
    if (!file) throw new AppError("No file provided.");
    if (file.size > MAX_FILE_SIZE) throw new AppError("File exceeds 10 MB limit.");

    const buffer = await file.arrayBuffer();
    const adapter = detectTradebookBroker(buffer);
    if (!adapter) {
      throw new AppError(
        "Unrecognised file format.",
        "Upload a Zerodha tradebook XLSX (Reports → Tradebook → Download as Excel)."
      );
    }

    const parseResult = adapter.parse(buffer);
    const fatalError = parseResult.errors.find((e) => e.severity === "error");
    if (fatalError) throw new AppError(fatalError.message);

    if (parseResult.trades.length === 0) {
      throw new AppError("No equity trades found in the file.");
    }

    const result = await executeTradebookImport(
      user.id,       // always from auth, never from form
      parseResult,
      file.name,
      supabase
    );

    if (result.status === "failed") {
      throw new AppError(
        result.errors[0]?.message ?? "Import failed.",
        "Check the file and try again."
      );
    }

    return result;
  });
}

export async function getTradeImportHistory() {
  const { supabase } = await getAuthUser();
  const { data, error } = await supabase
    .from("import_tradebooks")
    .select("*, accounts(label, broker)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    log.error("getTradeImportHistory failed", { error: error.message });
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function deleteTradeImport(importId: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuthUser();
    const { error } = await supabase
      .from("import_tradebooks")
      .delete()
      .eq("id", importId);
    if (error) throw describeDbError(error);
  });
}
```

- [ ] **Step 2: Create trades-actions.ts**

```typescript
// src/app/(authenticated)/actions/trades-actions.ts
"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import type { OpenPosition, OpenLot } from "@/lib/import/tradebook-types";

const log = createLogger({ service: "trades-actions" });

export async function getOpenPositions(
  accountIds?: string[]
): Promise<OpenPosition[]> {
  const { supabase } = await getAuthUser();

  // Build the parameterized open-positions query via RPC or raw SQL.
  // We use a Postgres function to keep the FIFO query server-side.
  // For now, we execute via supabase.rpc or a view.
  // Since RLS already filters by user, we only add the account filter.

  let query = supabase.rpc("get_open_positions", {
    p_account_ids: accountIds ?? null,
  });

  const { data, error } = await query;
  if (error) {
    log.error("getOpenPositions failed", { error: error.message });
    throw new Error(error.message);
  }
  return (data ?? []) as OpenPosition[];
}

export async function getOpenLotsForStock(
  isin: string,
  accountIds?: string[]
): Promise<OpenLot[]> {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase.rpc("get_open_lots_for_stock", {
    p_isin: isin,
    p_account_ids: accountIds ?? null,
  });

  if (error) {
    log.error("getOpenLotsForStock failed", { error: error.message, isin });
    throw new Error(error.message);
  }
  return (data ?? []) as OpenLot[];
}
```

- [ ] **Step 3: Add two Postgres functions to the migration file**

Append to `supabase/migrations/005_tradebook.sql`:

```sql
-- ============================================================================
-- get_open_positions(p_account_ids uuid[])
-- Returns open positions (FIFO-derived) for the calling user.
-- p_account_ids = NULL means all accounts.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_open_positions(p_account_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  isin          TEXT,
  stock_id      UUID,
  symbol        TEXT,
  name          TEXT,
  sector        TEXT,
  quantity      NUMERIC,
  avg_buy_price NUMERIC,
  current_price NUMERIC,
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
    COALESCE(ist.nse_symbol, ob.symbol)      AS symbol,
    ist.name,
    ist.sector,
    SUM(ob.remaining_qty)                    AS quantity,
    SUM(ob.remaining_qty * ob.buy_price)
      / SUM(ob.remaining_qty)                AS avg_buy_price,
    ist.price                                AS current_price,
    CASE WHEN ist.price IS NOT NULL
         THEN (ist.price - SUM(ob.remaining_qty * ob.buy_price) / SUM(ob.remaining_qty))
              * SUM(ob.remaining_qty)
         ELSE NULL END                       AS unrealized_pnl,
    CASE WHEN ist.price IS NOT NULL AND SUM(ob.remaining_qty * ob.buy_price) / SUM(ob.remaining_qty) > 0
         THEN (ist.price - SUM(ob.remaining_qty * ob.buy_price) / SUM(ob.remaining_qty))
              / (SUM(ob.remaining_qty * ob.buy_price) / SUM(ob.remaining_qty)) * 100
         ELSE NULL END                       AS pnl_pct
  FROM   open_buys ob
  LEFT   JOIN indian_stocks ist ON ob.stock_id = ist.id
  GROUP  BY ob.isin, ob.stock_id, ist.nse_symbol, ob.symbol, ist.name, ist.sector, ist.price
  ORDER  BY quantity DESC;
$$;

-- ============================================================================
-- get_open_lots_for_stock(p_isin text, p_account_ids uuid[])
-- Returns per-lot detail for one stock (lazy-loaded on row expand).
-- ============================================================================
CREATE OR REPLACE FUNCTION get_open_lots_for_stock(
  p_isin        TEXT,
  p_account_ids UUID[] DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  account_id     UUID,
  account_label  TEXT,
  broker         TEXT,
  trade_date     DATE,
  original_qty   NUMERIC,
  remaining_qty  NUMERIC,
  buy_price      NUMERIC,
  current_price  NUMERIC,
  unrealized_pnl NUMERIC,
  pnl_pct        NUMERIC,
  holding_days   INTEGER,
  cagr           NUMERIC,
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
  price AS (
    SELECT ist.price FROM indian_stocks ist
    JOIN   trades t2 ON t2.stock_id = ist.id
    WHERE  t2.isin = p_isin LIMIT 1
  )
  SELECT
    t.id,
    t.account_id,
    a.label                                             AS account_label,
    a.broker,
    t.trade_date,
    t.quantity                                          AS original_qty,
    t.quantity - COALESCE(s.sold_qty, 0)                AS remaining_qty,
    t.price                                             AS buy_price,
    p.price                                             AS current_price,
    CASE WHEN p.price IS NOT NULL
         THEN (p.price - t.price) * (t.quantity - COALESCE(s.sold_qty, 0))
         ELSE NULL END                                  AS unrealized_pnl,
    CASE WHEN p.price IS NOT NULL AND t.price > 0
         THEN (p.price - t.price) / t.price * 100
         ELSE NULL END                                  AS pnl_pct,
    (CURRENT_DATE - t.trade_date)::INTEGER              AS holding_days,
    CASE
      WHEN p.price IS NOT NULL
        AND t.price > 0
        AND (CURRENT_DATE - t.trade_date)::INTEGER >= 7
      THEN (POWER(p.price / t.price, 365.0 / (CURRENT_DATE - t.trade_date)::NUMERIC) - 1) * 100
      ELSE NULL
    END                                                 AS cagr,
    t.broker_trade_id
  FROM   trades t
  LEFT   JOIN sold s ON t.id = s.buy_trade_id
  JOIN   accounts a ON a.id = t.account_id
  CROSS  JOIN price p
  WHERE  t.user_id    = auth.uid()
    AND  t.isin       = p_isin
    AND  t.trade_type = 'buy'
    AND  (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
    AND  t.quantity   > COALESCE(s.sold_qty, 0)
  ORDER  BY t.trade_date ASC, t.executed_at ASC;
$$;
```

Apply both functions in the Supabase Dashboard SQL editor (they can be run independently from the table creation, any time).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(authenticated\)/actions/tradebook-actions.ts \
        src/app/\(authenticated\)/actions/trades-actions.ts \
        supabase/migrations/005_tradebook.sql
git commit -m "feat(actions): tradebook import + open positions server actions + RPCs"
```

---

## Task 7: API Route

**Files:**
- Create: `src/app/api/tradebook/route.ts`

**Interfaces:**
- Consumes: `getAuthUserOrNull` from `@/lib/supabase/server`; `detectTradebookBroker` from `@/lib/import/tradebook-broker-registry`; `executeTradebookImport` from `@/lib/import/tradebook-import-engine`; `rateLimit`, `RATE_LIMITS` from `@/lib/rate-limit`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/tradebook/route.ts
import { NextResponse } from "next/server";
import { getAuthUserOrNull } from "@/lib/supabase/server";
import { detectTradebookBroker } from "@/lib/import/tradebook-broker-registry";
import { executeTradebookImport } from "@/lib/import/tradebook-import-engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "tradebook-api" });
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const adapter = detectTradebookBroker(buffer);
  if (!adapter) {
    return NextResponse.json(
      { error: "Unrecognised tradebook format. Upload a Zerodha tradebook XLSX." },
      { status: 422 }
    );
  }

  const parseResult = adapter.parse(buffer);
  const fatal = parseResult.errors.find((e) => e.severity === "error");
  if (fatal) return NextResponse.json({ error: fatal.message }, { status: 422 });

  try {
    const result = await executeTradebookImport(user.id, parseResult, file.name, supabase);
    return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (err) {
    log.error("tradebook import error", { error: String(err) });
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const { data, error } = await supabase
      .from("import_tradebooks")
      .select("*, accounts(label, broker)")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("import_tradebooks")
    .select("*, accounts(label, broker)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("import_tradebooks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/tradebook/route.ts
git commit -m "feat(api): /api/tradebook route — POST/GET/DELETE"
```

---

## Task 8: Data Hook

**Files:**
- Create: `src/hooks/use-trades-data.ts`

**Interfaces:**
- Consumes: `getOpenPositions` from `@/app/(authenticated)/actions/trades-actions`; `OpenPosition` from `@/lib/import/tradebook-types`
- Produces: `useTradesData(accountFilter)`, `useInvalidateTrades()`, `TRADES_QUERY_KEY`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/use-trades-data.ts
"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getOpenPositions } from "@/app/(authenticated)/actions/trades-actions";
import type { OpenPosition } from "@/lib/import/tradebook-types";

export type { OpenPosition };

export const TRADES_QUERY_KEY = "trades-open-positions";

/** Returns open positions for all accounts (or a filtered subset). */
export function useTradesData(accountFilter: string) {
  const accountIds =
    accountFilter === "all" ? undefined : [accountFilter];

  return useQuery<OpenPosition[]>({
    queryKey: [TRADES_QUERY_KEY, accountFilter],
    queryFn: () => getOpenPositions(accountIds),
    staleTime: 60_000,
  });
}

export function useInvalidateTrades() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: [TRADES_QUERY_KEY] }),
    [qc]
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/use-trades-data.ts
git commit -m "feat(hooks): use-trades-data — open positions query hook"
```

---

## Task 9: UI — P&L Bar + Positions Table

**Files:**
- Create: `src/components/trades/trades-pnl-bar.tsx`
- Create: `src/components/trades/trades-table.tsx`

**Interfaces:**
- Consumes: `OpenPosition` from `@/lib/import/tradebook-types`; `OpenLot` from `@/lib/import/tradebook-types`; `getOpenLotsForStock` from `@/app/(authenticated)/actions/trades-actions`

- [ ] **Step 1: Create trades-pnl-bar.tsx**

```tsx
// src/components/trades/trades-pnl-bar.tsx
"use client";

import type { OpenPosition } from "@/lib/import/tradebook-types";

interface TradesPnlBarProps {
  positions: OpenPosition[];
}

export function TradesPnlBar({ positions }: TradesPnlBarProps) {
  const invested = positions.reduce(
    (sum, p) => sum + p.quantity * p.avg_buy_price,
    0
  );
  const current = positions.reduce(
    (sum, p) =>
      p.current_price != null
        ? sum + p.quantity * p.current_price
        : sum + p.quantity * p.avg_buy_price,
    0
  );
  const pnl = current - invested;
  const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
  const isPositive = pnl >= 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="flex flex-wrap gap-6 rounded-lg border bg-card px-6 py-4 text-sm">
      <div>
        <p className="text-muted-foreground">Invested</p>
        <p className="text-lg font-semibold">{fmt(invested)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Current Value</p>
        <p className="text-lg font-semibold">{fmt(current)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Unrealised P&L</p>
        <p
          className={`text-lg font-semibold ${
            isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {isPositive ? "+" : ""}
          {fmt(pnl)}{" "}
          <span className="text-sm font-normal">
            ({isPositive ? "+" : ""}
            {pnlPct.toFixed(2)}%)
          </span>
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">Open Positions</p>
        <p className="text-lg font-semibold">{positions.length}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create trades-table.tsx**

```tsx
// src/components/trades/trades-table.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { OpenPosition } from "@/lib/import/tradebook-types";
import { OpenLotsPanel } from "./open-lots-panel";

interface TradesTableProps {
  positions: OpenPosition[];
  accountFilter: string;
}

export function TradesTable({ positions, accountFilter }: TradesTableProps) {
  const [expandedIsin, setExpandedIsin] = useState<string | null>(null);

  const toggle = (isin: string) =>
    setExpandedIsin((prev) => (prev === isin ? null : isin));

  const fmt = (n: number | null) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(n);

  if (positions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        No open positions found. Import a tradebook to get started.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="w-8 px-3 py-3" />
            <th className="px-3 py-3 text-left font-medium">Company</th>
            <th className="px-3 py-3 text-right font-medium">Qty</th>
            <th className="px-3 py-3 text-right font-medium">Avg Cost</th>
            <th className="px-3 py-3 text-right font-medium">LTP</th>
            <th className="px-3 py-3 text-right font-medium">P&L</th>
            <th className="px-3 py-3 text-right font-medium">P&L %</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const isExpanded = expandedIsin === pos.isin;
            const pnlPos = (pos.unrealized_pnl ?? 0) >= 0;
            return (
              <>
                <tr
                  key={pos.isin}
                  className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                  onClick={() => toggle(pos.isin)}
                >
                  <td className="px-3 py-3 text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{pos.symbol}</p>
                    {pos.name && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {pos.name}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">{pos.quantity}</td>
                  <td className="px-3 py-3 text-right">{fmt(pos.avg_buy_price)}</td>
                  <td className="px-3 py-3 text-right">
                    {pos.current_price != null ? fmt(pos.current_price) : "—"}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-medium ${
                      pnlPos
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {pos.unrealized_pnl != null
                      ? `${pnlPos ? "+" : ""}${fmt(pos.unrealized_pnl)}`
                      : "—"}
                  </td>
                  <td
                    className={`px-3 py-3 text-right font-medium ${
                      pnlPos
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {pos.pnl_pct != null
                      ? `${pnlPos ? "+" : ""}${pos.pnl_pct.toFixed(2)}%`
                      : "—"}
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${pos.isin}-lots`}>
                    <td colSpan={7} className="bg-muted/20 px-6 py-4">
                      <OpenLotsPanel
                        isin={pos.isin}
                        accountFilter={accountFilter}
                        currentPrice={pos.current_price}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/trades/trades-pnl-bar.tsx \
        src/components/trades/trades-table.tsx
git commit -m "feat(ui): trades P&L bar and expandable positions table"
```

---

## Task 10: Open Lots Panel

**Files:**
- Create: `src/components/trades/open-lots-panel.tsx`

**Interfaces:**
- Consumes: `getOpenLotsForStock` from `@/app/(authenticated)/actions/trades-actions`; `OpenLot` from `@/lib/import/tradebook-types`

- [ ] **Step 1: Create open-lots-panel.tsx**

```tsx
// src/components/trades/open-lots-panel.tsx
"use client";

import { useEffect, useState } from "react";
import { getOpenLotsForStock } from "@/app/(authenticated)/actions/trades-actions";
import type { OpenLot } from "@/lib/import/tradebook-types";

interface OpenLotsPanelProps {
  isin: string;
  accountFilter: string;
  currentPrice: number | null;
}

export function OpenLotsPanel({ isin, accountFilter, currentPrice }: OpenLotsPanelProps) {
  const [lots, setLots] = useState<OpenLot[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const accountIds = accountFilter === "all" ? undefined : [accountFilter];
    getOpenLotsForStock(isin, accountIds)
      .then(setLots)
      .catch(() => setLots([]))
      .finally(() => setLoading(false));
  }, [isin, accountFilter]);

  const fmt = (n: number | null, decimals = 2) =>
    n == null
      ? "—"
      : new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: decimals,
        }).format(n);

  const fmtPct = (n: number | null) =>
    n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Loading lots…</p>;
  }
  if (!lots || lots.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No open lots found.</p>;
  }

  // Cumulative summary
  const totalQty = lots.reduce((s, l) => s + l.remaining_qty, 0);
  const totalCost = lots.reduce((s, l) => s + l.remaining_qty * l.buy_price, 0);
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
  const totalPnl = currentPrice != null ? (currentPrice - avgCost) * totalQty : null;
  const overallPct = currentPrice != null && avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : null;
  const avgHoldingDays =
    totalQty > 0
      ? lots.reduce((s, l) => s + l.remaining_qty * l.holding_days, 0) / totalQty
      : 0;
  const cumulativeCagr =
    currentPrice != null && avgCost > 0 && avgHoldingDays >= 7
      ? (Math.pow(currentPrice / avgCost, 365 / avgHoldingDays) - 1) * 100
      : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground border-b">
            <th className="py-2 pr-4 text-left font-medium">Buy Date</th>
            <th className="py-2 pr-4 text-left font-medium">Account</th>
            <th className="py-2 pr-4 text-right font-medium">Qty (rem/orig)</th>
            <th className="py-2 pr-4 text-right font-medium">Buy Price</th>
            <th className="py-2 pr-4 text-right font-medium">P&L</th>
            <th className="py-2 pr-4 text-right font-medium">P&L %</th>
            <th className="py-2 pr-4 text-right font-medium">Days</th>
            <th className="py-2 text-right font-medium">CAGR</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const pnlPos = (lot.unrealized_pnl ?? 0) >= 0;
            return (
              <tr key={lot.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{lot.trade_date}</td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {lot.account_label}
                </td>
                <td className="py-2 pr-4 text-right">
                  {lot.remaining_qty}/{lot.original_qty}
                </td>
                <td className="py-2 pr-4 text-right">{fmt(lot.buy_price)}</td>
                <td
                  className={`py-2 pr-4 text-right font-medium ${
                    pnlPos
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {lot.unrealized_pnl != null
                    ? `${pnlPos ? "+" : ""}${fmt(lot.unrealized_pnl, 0)}`
                    : "—"}
                </td>
                <td
                  className={`py-2 pr-4 text-right ${
                    pnlPos
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {fmtPct(lot.pnl_pct)}
                </td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {lot.holding_days}
                </td>
                <td className="py-2 text-right font-medium">
                  {lot.cagr != null ? fmtPct(lot.cagr) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        {/* Cumulative summary row */}
        <tfoot className="border-t-2">
          <tr className="font-semibold">
            <td className="py-2 pr-4 text-muted-foreground" colSpan={2}>
              Total
            </td>
            <td className="py-2 pr-4 text-right">{totalQty}</td>
            <td className="py-2 pr-4 text-right">{fmt(avgCost)}</td>
            <td
              className={`py-2 pr-4 text-right ${
                (totalPnl ?? 0) >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {totalPnl != null
                ? `${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl, 0)}`
                : "—"}
            </td>
            <td
              className={`py-2 pr-4 text-right ${
                (overallPct ?? 0) >= 0
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {fmtPct(overallPct)}
            </td>
            <td className="py-2 pr-4 text-right text-muted-foreground">
              {Math.round(avgHoldingDays)}d avg
            </td>
            <td className="py-2 text-right">{fmtPct(cumulativeCagr)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/trades/open-lots-panel.tsx
git commit -m "feat(ui): open lots panel — per-lot CAGR + cumulative summary"
```

---

## Task 11: Import Button + Trades Page + Nav

**Files:**
- Create: `src/components/trades/trade-import-button.tsx`
- Create: `src/app/(authenticated)/trades/page.tsx`
- Modify: sidebar/nav component (find with `grep -r "dashboard" src/components/layout --include="*.tsx" -l`)

- [ ] **Step 1: Create trade-import-button.tsx**

```tsx
// src/components/trades/trade-import-button.tsx
"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importTradebook, getTradeImportHistory } from "@/app/(authenticated)/actions/tradebook-actions";
import { useInvalidateTrades } from "@/hooks/use-trades-data";
import { toastError } from "@/lib/toast-error";
import { toast } from "sonner";

interface ImportRecord {
  id: string;
  created_at: string;
  broker: string;
  imported_count: number;
  skipped_count: number;
  date_from: string | null;
  date_to: string | null;
  status: string;
  accounts: { label: string; broker: string } | null;
}

export function TradeImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ImportRecord[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const invalidate = useInvalidateTrades();

  const handleFile = async (file: File) => {
    setLoading(true);
    const fd = new FormData();
    fd.append("file", file);
    const result = await importTradebook(fd);
    setLoading(false);

    if (!result.ok) {
      toastError(new Error(result.error), { message: result.error });
      return;
    }

    const r = result.data;
    toast.success(
      `Imported ${r.imported_count} trade${r.imported_count !== 1 ? "s" : ""}` +
        (r.skipped_count > 0 ? ` · ${r.skipped_count} already existed` : ""),
      { description: r.account_label }
    );
    await invalidate();
  };

  const openHistory = async () => {
    const h = await getTradeImportHistory();
    setHistory(h as ImportRecord[]);
    setShowHistory(true);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Import Tradebook
        </Button>
        <Button size="sm" variant="ghost" onClick={openHistory}>
          History
        </Button>
      </div>

      {/* Inline history drawer */}
      {showHistory && history && (
        <div className="fixed inset-0 z-50 flex items-end justify-end">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setShowHistory(false)}
          />
          <div className="relative z-10 w-full max-w-lg bg-background border-l shadow-xl h-full overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Import History</h2>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowHistory(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {history.length === 0 ? (
              <p className="text-muted-foreground text-sm">No imports yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>{h.accounts?.label ?? h.broker}</span>
                      <span className="text-muted-foreground">
                        {new Date(h.created_at).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-1">
                      {h.imported_count} new · {h.skipped_count} skipped
                      {h.date_from && ` · ${h.date_from} → ${h.date_to}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Create the trades page**

```tsx
// src/app/(authenticated)/trades/page.tsx
"use client";

import { useState, useEffect } from "react";
import { TradesPnlBar } from "@/components/trades/trades-pnl-bar";
import { TradesTable } from "@/components/trades/trades-table";
import { TradeImportButton } from "@/components/trades/trade-import-button";
import { AccountFilter } from "@/components/account/account-filter";
import { useTradesData } from "@/hooks/use-trades-data";
import { getAuthUser } from "@/lib/supabase/server";

// Accounts for the filter chip come from existing /api/accounts or actions.
// Use a lightweight inline fetch for now.
import { useQuery } from "@tanstack/react-query";

type Account = { id: string; label: string; broker: string };

function useTradeAccounts() {
  return useQuery<Account[]>({
    queryKey: ["trade-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/accounts");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
}

export default function TradesDashboardPage() {
  const [accountFilter, setAccountFilter] = useState("all");
  const { data: positions = [], isLoading } = useTradesData(accountFilter);
  const { data: accounts = [] } = useTradeAccounts();

  useEffect(() => {
    document.title = "Trades · StockTracker";
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Trades Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Open positions derived from imported tradebooks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AccountFilter
            accounts={accounts}
            value={accountFilter}
            onChange={setAccountFilter}
          />
          <TradeImportButton />
        </div>
      </div>

      {/* Summary bar */}
      {positions.length > 0 && <TradesPnlBar positions={positions} />}

      {/* Table */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Loading positions…
        </div>
      ) : (
        <TradesTable positions={positions} accountFilter={accountFilter} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add "Trades" nav item**

Find the sidebar/nav file:
```bash
grep -r "dashboard" src/components/layout --include="*.tsx" -l
```

Open the file that contains the nav links list. Add a "Trades" entry immediately after "Dashboard":

```tsx
// Add to the nav links array (exact structure mirrors existing Dashboard link):
{
  href: "/trades",
  label: "Trades",
  icon: TrendingUp,   // import { TrendingUp } from "lucide-react"
}
```

Confirm the icon import is included at the top of the file.

- [ ] **Step 4: Run dev server and verify**

```bash
npm run dev
```

- Open `/trades` — verify page loads.
- Click "Import Tradebook" → select the Zerodha file from `~/Downloads/tradebook-XD6134-EQ (10).xlsx`.
- Confirm toast shows imported count.
- Confirm positions table appears with GRAVITA and other stocks.
- Click a row to expand → verify the open lots panel appears with per-lot CAGR and summary row.
- Change account filter (if multiple accounts) → verify table updates.
- Re-import the same file → confirm toast says "N already existed" and no duplicates appear.

- [ ] **Step 5: Commit**

```bash
git add src/components/trades/trade-import-button.tsx \
        src/app/\(authenticated\)/trades/page.tsx \
        src/components/layout/
git commit -m "feat(ui): trades dashboard page, import button, nav link"
```

---

## Task 12: Coverage Check & Final Cleanup

**Files:**
- Review test coverage across all new files.

- [ ] **Step 1: Run full test suite with coverage**

```bash
npm run test:coverage
```

Expected: all thresholds pass (95%). If any new file is under threshold, add targeted tests in the relevant `__tests__/lib/` file.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Fix any lint errors before committing.

- [ ] **Step 4: Final integration smoke test**

Using the running dev server:
1. Import the Zerodha tradebook a second time → toast shows "494 already existed, 0 imported".
2. Navigate `/dashboard` → confirm existing holdings dashboard is unchanged.
3. Navigate `/trades` → confirm open positions are correct.
4. Expand one company → lots panel shows per-lot CAGR, cumulative row at bottom.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: tradebook import & trades dashboard MVP

- 3 new tables: trades, import_tradebooks, trade_lot_matches
- Zerodha XLSX parser with canParse detection
- In-memory FIFO engine (intraday + delivery, idempotent)
- /trades dashboard — open positions + expandable lot detail + CAGR
- Account filter consolidated view
- Import idempotent: same file reimported = 0 new rows, no FIFO recompute
"
```
