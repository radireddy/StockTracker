import { describe, it, expect } from "vitest";
import { computePortfolioPnl } from "@/lib/utils/portfolio-pnl";
import type { CompanyForPnl } from "@/lib/utils/portfolio-pnl";

function makeCompany(overrides: {
  quantity?: number | null;
  avg_buy_price?: number | null;
  price?: number | null;
} = {}): CompanyForPnl {
  return {
    quantity: overrides.quantity !== undefined ? overrides.quantity : 10,
    avg_buy_price: overrides.avg_buy_price !== undefined ? overrides.avg_buy_price : 80,
    indian_stocks: { price: overrides.price !== undefined ? overrides.price : 100 },
  };
}

describe("computePortfolioPnl", () => {
  it("returns null for an empty list", () => {
    expect(computePortfolioPnl([])).toBeNull();
  });

  it("returns null when no company has qty + avg_buy_price", () => {
    expect(computePortfolioPnl([makeCompany({ quantity: null })])).toBeNull();
    expect(computePortfolioPnl([makeCompany({ avg_buy_price: null })])).toBeNull();
  });

  it("returns null when no company has a current price", () => {
    expect(computePortfolioPnl([makeCompany({ price: null })])).toBeNull();
  });

  it("computes correct totals for a single profitable position", () => {
    const result = computePortfolioPnl([makeCompany({ quantity: 10, avg_buy_price: 80, price: 100 })]);
    expect(result).not.toBeNull();
    expect(result!.totalInvested).toBe(800);
    expect(result!.totalCurrent).toBe(1000);
    expect(result!.pnl).toBe(200);
    expect(result!.pnlPct).toBeCloseTo(25);
    expect(result!.heldCount).toBe(1);
  });

  it("computes a loss position correctly", () => {
    const result = computePortfolioPnl([makeCompany({ quantity: 10, avg_buy_price: 100, price: 80 })]);
    expect(result!.pnl).toBe(-200);
    expect(result!.pnlPct).toBeCloseTo(-20);
  });

  it("aggregates multiple positions", () => {
    const companies = [
      makeCompany({ quantity: 10, avg_buy_price: 100, price: 120 }), // invested 1000, current 1200
      makeCompany({ quantity: 5, avg_buy_price: 200, price: 180 }),  // invested 1000, current 900
    ];
    const result = computePortfolioPnl(companies)!;
    expect(result.totalInvested).toBe(2000);
    expect(result.totalCurrent).toBe(2100);
    expect(result.pnl).toBe(100);
    expect(result.pnlPct).toBeCloseTo(5);
    expect(result.heldCount).toBe(2);
  });

  it("skips watchlist entries (null quantity) when aggregating", () => {
    const companies = [
      makeCompany({ quantity: 10, avg_buy_price: 100, price: 100 }),
      makeCompany({ quantity: null, avg_buy_price: null, price: 100 }),
    ];
    const result = computePortfolioPnl(companies)!;
    expect(result.heldCount).toBe(1);
    expect(result.totalInvested).toBe(1000);
  });

  it("skips companies without a live price", () => {
    const companies = [
      makeCompany({ quantity: 10, avg_buy_price: 100, price: 120 }),
      makeCompany({ quantity: 5, avg_buy_price: 100, price: null }),
    ];
    const result = computePortfolioPnl(companies)!;
    expect(result.heldCount).toBe(1);
    expect(result.totalInvested).toBe(1000);
  });

  it("returns pnl of 0 when bought at exactly current price", () => {
    const result = computePortfolioPnl([makeCompany({ avg_buy_price: 100, price: 100 })]);
    expect(result!.pnl).toBe(0);
    expect(result!.pnlPct).toBe(0);
  });
});
