import { describe, it, expect } from "vitest";
import { computeFifoMatches } from "@/lib/import/fifo-engine";
import type { RawTradeForFifo } from "@/lib/import/tradebook-types";
import type { CorporateActionContext } from "@/lib/import/corporate-actions";

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

  it("handles multiple sells draining multiple buy lots", () => {
    const trades = [
      trade("b1", "INE001", "2023-01-01", "buy", 100,  80),
      trade("b2", "INE001", "2023-06-01", "buy", 100, 120),
      trade("s1", "INE001", "2024-01-01", "sell", 80, 150),
      trade("s2", "INE001", "2024-06-01", "sell", 80, 200),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    // s1 takes 80 from b1; s2 takes 20 from b1 + 60 from b2
    expect(matches).toHaveLength(3);
    const s1Match = matches.filter((m) => m.sell_trade_id === "s1");
    const s2Matches = matches.filter((m) => m.sell_trade_id === "s2");
    expect(s1Match).toHaveLength(1);
    expect(s1Match[0].buy_trade_id).toBe("b1");
    expect(s1Match[0].matched_quantity).toBe(80);
    expect(s2Matches).toHaveLength(2);
    const s2b1 = s2Matches.find((m) => m.buy_trade_id === "b1")!;
    const s2b2 = s2Matches.find((m) => m.buy_trade_id === "b2")!;
    expect(s2b1.matched_quantity).toBe(20);
    expect(s2b2.matched_quantity).toBe(60);
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

  it("pure sell-only day (no same-day buys) drains delivery queue", () => {
    const trades = [
      trade("b1", "INE001", "2024-01-01", "buy", 100, 100),
      trade("s1", "INE001", "2024-06-01", "sell", 50, 140),
    ];
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades });
    expect(matches[0].is_intraday).toBe(false);
    expect(matches[0].matched_quantity).toBe(50);
  });
});

describe("computeFifoMatches — realized_pnl and metadata", () => {
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

  it("returns empty array for empty input", () => {
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades: [] });
    expect(matches).toHaveLength(0);
  });
});

describe("computeFifoMatches — corporate actions", () => {
  it("matches a pre-split buy against a post-split sell (1:5), unified by canonical id", () => {
    const trades: RawTradeForFifo[] = [
      { id: "b", isin: "OLD", stock_id: "old", trade_date: "2025-01-01", trade_type: "buy", quantity: 270, price: 100, executed_at: null },
      { id: "s", isin: "NEW", stock_id: "new", trade_date: "2025-08-01", trade_type: "sell", quantity: 1350, price: 30, executed_at: null },
    ];
    const ca = {
      canonicalMap: new Map([["old", "new"]]),
      actionsBySecurity: new Map([
        ["new", [{ stock_id: "new", action_type: "split" as const, ex_date: "2025-06-01", factor: 5 }]],
      ]),
    };
    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades, ca });
    const totalMatched = matches.reduce((s, m) => s + m.matched_quantity, 0);
    expect(totalMatched).toBe(1350); // 270 buy × 5 == 1350 sold → fully closed
    expect(matches.some((m) => m.buy_trade_id === "b" && m.sell_trade_id === "s")).toBe(true);
  });

  it("reconciles from-security buys against to-security sells at the swap ratio (merger)", () => {
    // Equitas shape: bought 1020 EQUITAS (from-id), merged into EQUITASBNK (to-id)
    // at ×2.31 on 2023-10-01, then sold 2356 EQUITASBNK on 2024-04-15.
    const FROM = "from-id";
    const TO   = "to-id";

    const trades: RawTradeForFifo[] = [
      { id: "b1", isin: "INE988K01017", stock_id: FROM,
        trade_date: "2022-01-01", trade_type: "buy", quantity: 1020, price: 100, executed_at: null },
      { id: "s1", isin: "INE063P01018", stock_id: TO,
        trade_date: "2024-04-15", trade_type: "sell", quantity: 2356, price: 200, executed_at: null },
    ];

    const ca: CorporateActionContext = {
      canonicalMap: new Map([[FROM, TO]]),
      actionsBySecurity: new Map([
        [TO, [{ stock_id: TO, action_type: "merger", ex_date: "2023-10-01", factor: 2.31 }]],
      ]),
    };

    const matches = computeFifoMatches({ userId: USER, accountId: ACC, trades, ca });
    // b1: 1020 × 2.31 = 2356.2 adjusted shares. s1 consumes 2356 of them.
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.buy_trade_id).toBe("b1");
    expect(m.sell_trade_id).toBe("s1");
    expect(m.matched_quantity).toBeCloseTo(2356, 0);
    // Cost basis: ₹100 / 2.31 ≈ ₹43.29 per EQUITASBNK share
    expect(m.buy_price).toBeCloseTo(100 / 2.31, 2);
    // Realized PnL: (200 - 43.29) × 2356 ≈ positive
    expect(m.realized_pnl).toBeGreaterThan(0);
    expect(m.is_long_term).toBe(true); // > 365 days
  });
});
