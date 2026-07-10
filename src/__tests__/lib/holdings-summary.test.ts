import { describe, it, expect } from "vitest";
import { summarizeHoldings } from "@/lib/holdings";

describe("summarizeHoldings", () => {
  it("sums quantity and cost and computes the cost-weighted average price", () => {
    const s = summarizeHoldings(
      [
        { quantity: 10, avg_buy_price: 100 },
        { quantity: 30, avg_buy_price: 200 },
      ],
      null
    );
    expect(s.totalQty).toBe(40);
    expect(s.totalCost).toBe(10 * 100 + 30 * 200);
    expect(s.weightedAvg).toBe((10 * 100 + 30 * 200) / 40);
  });

  it("leaves P&L fields null when there is no current price", () => {
    const s = summarizeHoldings([{ quantity: 10, avg_buy_price: 100 }], null);
    expect(s.totalCurrentValue).toBeNull();
    expect(s.totalPnl).toBeNull();
    expect(s.totalPnlPct).toBeNull();
  });

  it("computes P&L and P&L% for a normal position with a current price", () => {
    const s = summarizeHoldings([{ quantity: 10, avg_buy_price: 100 }], 150);
    expect(s.totalCurrentValue).toBe(1500);
    expect(s.totalPnl).toBe(500);
    expect(s.totalPnlPct).toBeCloseTo(50);
  });

  it("returns a non-null P&L but a NULL P&L% when total cost is zero (avg price 0) yet a price exists", () => {
    // This is the crash condition: totalPnl is a real number while totalPnlPct
    // is undefined (no cost basis to compute a percentage against). Consumers
    // MUST NOT assume totalPnlPct is non-null just because totalPnl is.
    const s = summarizeHoldings([{ quantity: 10, avg_buy_price: 0 }], 150);
    expect(s.totalCost).toBe(0);
    expect(s.totalPnl).toBe(1500);
    expect(s.totalPnlPct).toBeNull();
  });

  it("handles an empty holdings list", () => {
    const s = summarizeHoldings([], 150);
    expect(s.totalQty).toBe(0);
    expect(s.totalCost).toBe(0);
    expect(s.weightedAvg).toBe(0);
    expect(s.totalCurrentValue).toBe(0);
    expect(s.totalPnl).toBe(0);
    expect(s.totalPnlPct).toBeNull();
  });
});
