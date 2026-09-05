import { describe, it, expect } from "vitest";
import { detectCorporateActions, snapFactor, type SecurityTrades } from "@/lib/import/corporate-action-detect";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";

const EMPTY_CA = { canonicalMap: new Map<string, string>(), actionsBySecurity: new Map() };

function t(o: Partial<TradeForOpenPositions> & Pick<TradeForOpenPositions, "id" | "trade_type" | "quantity" | "price" | "trade_date">): TradeForOpenPositions {
  return { user_id: "u", account_id: "a", isin: "INE1", stock_id: "s1", symbol: "SYM", executed_at: null, broker_trade_id: o.id, ...o };
}

describe("snapFactor", () => {
  it("snaps near-2 to exactly 2", () => expect(snapFactor(2.02)).toBe(2));
  it("returns null for an implausible ratio", () => expect(snapFactor(7.3)).toBeNull());
});

describe("detectCorporateActions — Signal A (oversold)", () => {
  it("flags a 1:1 bonus (bought 100, sold 200) as an inferred split/bonus factor 2", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }),
        t({ id: "s", trade_type: "sell", quantity: 200, price: 600, trade_date: "2024-09-01" }),
      ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.status).toBe("inferred");
    expect(c.factor).toBe(2);
    expect(c.observed).toMatchObject({ buys: 100, sells: 200 });
  });

  it("does NOT flag a normal reconciled book", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }),
        t({ id: "s", trade_type: "sell", quantity: 100, price: 1200, trade_date: "2024-09-01" }),
      ],
    };
    expect(detectCorporateActions([sec], EMPTY_CA)).toHaveLength(0);
  });
});
