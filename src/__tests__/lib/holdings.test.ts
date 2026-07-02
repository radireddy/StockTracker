import { describe, it, expect } from "vitest";
import { combineHoldingLots, requiresAccountForMove } from "@/lib/holdings";

describe("combineHoldingLots", () => {
  it("adds quantities and cost-weights the average price", () => {
    // 500 @ 1800 + 400 @ 1650  ->  900 @ (900000 + 660000) / 900 = 1733.33...
    const result = combineHoldingLots(
      { quantity: 500, avg_buy_price: 1800 },
      { quantity: 400, avg_buy_price: 1650 }
    );
    expect(result.quantity).toBe(900);
    expect(result.avg_buy_price).toBeCloseTo(1733.3333, 3);
  });

  it("keeps the average when prices are equal", () => {
    const result = combineHoldingLots(
      { quantity: 100, avg_buy_price: 250 },
      { quantity: 50, avg_buy_price: 250 }
    );
    expect(result.quantity).toBe(150);
    expect(result.avg_buy_price).toBe(250);
  });

  it("uses the added price when there is no prior quantity", () => {
    const result = combineHoldingLots(
      { quantity: 0, avg_buy_price: 0 },
      { quantity: 30, avg_buy_price: 500 }
    );
    expect(result.quantity).toBe(30);
    expect(result.avg_buy_price).toBe(500);
  });
});

describe("requiresAccountForMove", () => {
  it("requires an account moving watchlist -> holdings", () => {
    expect(requiresAccountForMove("watchlist", "holdings")).toBe(true);
  });
  it("does not require one moving holdings -> holdings (positions carry over)", () => {
    expect(requiresAccountForMove("holdings", "holdings")).toBe(false);
  });
  it("does not require one when the target is a watchlist", () => {
    expect(requiresAccountForMove("watchlist", "watchlist")).toBe(false);
    expect(requiresAccountForMove("holdings", "watchlist")).toBe(false);
  });
});
