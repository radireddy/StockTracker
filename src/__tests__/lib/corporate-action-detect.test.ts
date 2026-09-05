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

  it("flags unexplained status when ratio is implausible (bought 100, sold 730 → 7.3)", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }),
        t({ id: "s", trade_type: "sell", quantity: 730, price: 600, trade_date: "2024-09-01" }),
      ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.status).toBe("unexplained");
    expect(c.factor).toBe(7.3);
    expect(c.observed).toMatchObject({ buys: 100, sells: 730 });
  });
});

describe("detectCorporateActions — Signal B (holdings mismatch)", () => {
  it("flags factor 2 when FIFO-open is half the broker holdings", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "s1", isin: "INE1", account_id: "a", holdingsQty: 200,
      trades: [ t({ id: "b", trade_type: "buy", quantity: 100, price: 1000, trade_date: "2024-01-01" }) ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.factor).toBe(2);
    expect(c.status).toBe("inferred");
  });
});

describe("detectCorporateActions — Signal C (cross-ISIN, same symbol)", () => {
  it("links old→new stock_ids and proposes the factor (270 old, 1350 sold new)", () => {
    const sec: SecurityTrades = {
      symbol: "SYM", stock_id: "new", isin: "NEW", account_id: "a", holdingsQty: 0,
      trades: [
        t({ id: "b", stock_id: "old", isin: "OLD", trade_type: "buy", quantity: 270, price: 100, trade_date: "2025-01-01" }),
        t({ id: "s", stock_id: "new", isin: "NEW", trade_type: "sell", quantity: 1350, price: 30, trade_date: "2025-08-01" }),
      ],
    };
    const [c] = detectCorporateActions([sec], EMPTY_CA);
    expect(c.factor).toBe(5);
    expect(c.matched_stock_ids?.sort()).toEqual(["new", "old"]);
  });
});
