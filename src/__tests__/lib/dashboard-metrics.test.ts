import { describe, it, expect } from "vitest";
import {
  computeHoldingMetrics,
  totalCurrentValue,
  holdingSortValue,
  getScenarioReturn,
} from "@/lib/utils/dashboard-metrics";
import { DEFAULT_ALLOCATION_RANGES } from "@/types/database";
import type { DashboardCompanyRow } from "@/hooks/use-dashboard-data";

function makeRow(overrides: Partial<DashboardCompanyRow> = {}): DashboardCompanyRow {
  return {
    id: "c1",
    isin: "INE000A01001",
    star_rating: 4,
    strategy: "core",
    buy_price: null,
    investment_horizon_years: 5,
    indian_stocks: { name: "Test Co", nse_symbol: "TEST", price: 100, market_cap: 1e9 },
    projection_models: [],
    quantity: 10,
    avg_buy_price: 80,
    ...overrides,
  };
}

const ranges = DEFAULT_ALLOCATION_RANGES;

describe("computeHoldingMetrics", () => {
  it("computes P&L amount and percent for a held position", () => {
    const m = computeHoldingMetrics(makeRow(), ranges, 1000);
    expect(m.invested).toBe(800);
    expect(m.currentValue).toBe(1000);
    expect(m.pnlAmt).toBe(200);
    expect(m.pnlPct).toBeCloseTo(25);
  });

  it("returns null position figures for a watchlist row (no quantity)", () => {
    const m = computeHoldingMetrics(makeRow({ quantity: null, avg_buy_price: null }), ranges, 0);
    expect(m.invested).toBeNull();
    expect(m.currentValue).toBeNull();
    expect(m.pnlAmt).toBeNull();
    expect(m.pnlPct).toBeNull();
    // research figures still derive from price/buy price
    expect(m.price).toBe(100);
  });

  it("derives margin of safety from the manual buy price", () => {
    const m = computeHoldingMetrics(makeRow({ buy_price: 125 }), ranges, 1000);
    // (125 - 100) / 125 = 0.2
    expect(m.mos).toBeCloseTo(0.2);
  });

  it("flags allocation status against the star-rating band by current value", () => {
    // Single stock is 100% of a tiny portfolio → far over any per-stock band.
    const m = computeHoldingMetrics(makeRow(), ranges, 1000);
    expect(m.valuePct).toBeCloseTo(100);
    expect(m.allocStatus).toBe("over");
  });
});

describe("getScenarioReturn", () => {
  it("prefers the live-computed IRR from target market cap", () => {
    const scenarios = [
      { scenario_type: "base", target_market_cap: 200, irr: 5, buy_price: null },
    ];
    // current market cap 100 Cr (1e9 raw), horizon 1yr → (200/100 - 1) = 100%
    const r = getScenarioReturn(scenarios, "base", 1e9, 1);
    expect(r).toBeCloseTo(100);
  });

  it("falls back to the stored IRR when live inputs are missing", () => {
    const scenarios = [
      { scenario_type: "base", target_market_cap: null, irr: 12, buy_price: null },
    ];
    expect(getScenarioReturn(scenarios, "base", null, null)).toBe(12);
  });
});

describe("totalCurrentValue", () => {
  it("sums current value and ignores rows without price or quantity", () => {
    const rows = [
      makeRow({ quantity: 10, indian_stocks: { name: "A", nse_symbol: "A", price: 100, market_cap: null } }),
      makeRow({ quantity: null, indian_stocks: { name: "B", nse_symbol: "B", price: 50, market_cap: null } }),
      makeRow({ quantity: 5, indian_stocks: { name: "C", nse_symbol: "C", price: null, market_cap: null } }),
    ];
    expect(totalCurrentValue(rows)).toBe(1000);
  });
});

describe("holdingSortValue", () => {
  it("maps each sort field to its metric", () => {
    const m = computeHoldingMetrics(makeRow({ buy_price: 125 }), ranges, 1000);
    expect(holdingSortValue(m, "pnl")).toBeCloseTo(25);
    expect(holdingSortValue(m, "value")).toBe(1000);
    expect(holdingSortValue(m, "mos")).toBeCloseTo(0.2);
    expect(holdingSortValue(m, "base")).toBeNull();
  });
});
