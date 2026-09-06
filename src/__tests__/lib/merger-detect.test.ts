import { describe, it, expect } from "vitest";
import { detectOrphanPairs } from "@/lib/import/merger-detect";
import type { SecurityTrades } from "@/lib/import/corporate-action-detect";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";

const EMPTY_CTX = { canonicalMap: new Map(), actionsBySecurity: new Map() };
const ACC = "acc-1";

function buy(sym: string, isin: string, stockId: string | null, date: string, qty: number): TradeForOpenPositions {
  return { id: "t1", user_id: "u", account_id: ACC, symbol: sym, isin, stock_id: stockId,
    trade_date: date, trade_type: "buy", quantity: qty, price: 100,
    executed_at: null, broker_trade_id: "b" };
}

function sell(sym: string, isin: string, stockId: string | null, date: string, qty: number): TradeForOpenPositions {
  return { id: "t2", user_id: "u", account_id: ACC, symbol: sym, isin, stock_id: stockId,
    trade_date: date, trade_type: "sell", quantity: qty, price: 200,
    executed_at: null, broker_trade_id: "s" };
}

function sec(sym: string, isin: string, stockId: string | null, trades: TradeForOpenPositions[]): SecurityTrades {
  return { symbol: sym, stock_id: stockId, isin, account_id: ACC, trades, holdingsQty: null };
}

describe("detectOrphanPairs", () => {
  it("detects Equitas→EquitasBnk shape (×2.31, denom 255 ≤ 500)", () => {
    const securities: SecurityTrades[] = [
      sec("EQUITAS", "INE988K01017", "from-id", [
        buy("EQUITAS", "INE988K01017", "from-id", "2022-01-01", 1020),
      ]),
      sec("EQUITASBNK", "INE063P01018", "to-id", [
        sell("EQUITASBNK", "INE063P01018", "to-id", "2024-04-15", 2356),
      ]),
    ];
    const suggestions = detectOrphanPairs(securities, EMPTY_CTX);
    expect(suggestions).toHaveLength(1);
    const s = suggestions[0];
    expect(s.fromSymbol).toBe("EQUITAS");
    expect(s.toSymbol).toBe("EQUITASBNK");
    expect(s.impliedRatio).toBeCloseTo(2356 / 1020, 4);
    expect(s.fromQty).toBe(1020);
    expect(s.toQty).toBe(2356);
  });

  it("does not suggest a pair if from-security also has sells", () => {
    // ARVINDFASN shape: buy 1500, sell 4800 — same security oversell, not a merger
    const securities: SecurityTrades[] = [
      sec("ARVINDFASN", "INE414G01012", "id-a", [
        buy("ARVINDFASN", "INE414G01012", "id-a", "2021-01-01", 1500),
        sell("ARVINDFASN", "INE414G01012", "id-a", "2023-06-01", 4800),
      ]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("does not suggest a pair if to-security also has buys", () => {
    const securities: SecurityTrades[] = [
      sec("ASTOCK", "INE001", "id-a", [buy("ASTOCK", "INE001", "id-a", "2021-01-01", 100)]),
      sec("BSTOCK", "INE002", "id-b", [
        buy("BSTOCK", "INE002", "id-b", "2020-01-01", 50),
        sell("BSTOCK", "INE002", "id-b", "2023-06-01", 231),
      ]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("skips a pair with a noisy ratio (denom > 500 in lowest terms)", () => {
    // from=503 (prime), to=701 (prime); gcd=1, denom=503 > 500 → skipped
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", "id-a", [buy("FROM", "INE001", "id-a", "2021-01-01", 503)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2023-01-01", 701)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("does not pair securities from different accounts", () => {
    const securities: SecurityTrades[] = [
      { symbol: "FROM", stock_id: "id-a", isin: "INE001", account_id: "acc-1", holdingsQty: null,
        trades: [buy("FROM", "INE001", "id-a", "2021-01-01", 1020)] },
      { symbol: "TO", stock_id: "id-b", isin: "INE002", account_id: "acc-2", holdingsQty: null,
        trades: [sell("TO", "INE002", "id-b", "2024-01-01", 2356)] },
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });

  it("skips from-security with no stock_id", () => {
    const securities: SecurityTrades[] = [
      sec("FROM", "INE001", null, [buy("FROM", "INE001", null, "2021-01-01", 1020)]),
      sec("TO",   "INE002", "id-b", [sell("TO", "INE002", "id-b", "2024-01-01", 2356)]),
    ];
    expect(detectOrphanPairs(securities, EMPTY_CTX)).toHaveLength(0);
  });
});
