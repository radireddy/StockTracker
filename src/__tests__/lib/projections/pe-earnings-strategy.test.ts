import { describe, it, expect } from "vitest";
import { PeEarningsStrategy } from "@/lib/projections/pe-earnings-strategy";
import type { FinancialYear } from "@/types/database";

function makeFY(overrides: Partial<FinancialYear> = {}): FinancialYear {
  return {
    id: "fy-1",
    company_id: "c1",
    projection_model_id: "pm1",
    user_id: "u1",
    year: "FY25",
    is_estimate: false,
    revenue: 1000,
    revenue_growth_pct: null,
    ebitda: null,
    ebitda_margin_pct: 20,
    ebitda_growth_pct: null,
    depreciation: 30,
    finance_cost: 20,
    other_income: 10,
    exceptional_items: 0,
    pbt: null,
    tax_pct: 25,
    pat: null,
    pat_growth_pct: null,
    pat_margin_pct: null,
    minority_interest: null,
    pat_for_shareholders: null,
    pe: null,
    peg: null,
    net_debt: null,
    lease_liability: null,
    total_debt: null,
    ev_ebitda_ratio: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const strategy = new PeEarningsStrategy();

describe("PeEarningsStrategy", () => {
  describe("properties", () => {
    it("has correct type and label", () => {
      expect(strategy.type).toBe("pe_earnings");
      expect(strategy.label).toBe("PE / Earnings");
    });

    it("has row configs", () => {
      expect(strategy.rowConfigs.length).toBeGreaterThan(0);
      const keys = strategy.rowConfigs.map((r) => r.key);
      expect(keys).toContain("revenue");
      expect(keys).toContain("pat");
      expect(keys).toContain("pe");
      expect(keys).toContain("peg");
    });
  });

  describe("computeFields", () => {
    it("computes EBITDA from revenue * margin", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 20 })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].ebitda).toBe(200);
    });

    it("computes revenue growth from previous year", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800 }),
        makeFY({ year: "FY25", revenue: 1000 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].revenue_growth_pct).toBe(25);
      expect(result[0].revenue_growth_pct).toBeNull();
    });

    it("computes EBITDA growth from previous year", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800, ebitda_margin_pct: 20 }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set());
      // FY24 EBITDA = 160, FY25 EBITDA = 250
      expect(result[1].ebitda_growth_pct).toBeCloseTo(56.3, 0);
    });

    it("computes PBT correctly", () => {
      const data = [
        makeFY({
          revenue: 1000,
          ebitda_margin_pct: 20,
          depreciation: 30,
          finance_cost: 20,
          other_income: 10,
          exceptional_items: 5,
        }),
      ];
      const result = strategy.computeFields(data, new Set());
      // EBITDA = 200, PBT = 200 - 30 - 20 + 10 + 5 = 165
      expect(result[0].pbt).toBe(165);
    });

    it("computes PAT from PBT and tax", () => {
      const data = [
        makeFY({
          revenue: 1000,
          ebitda_margin_pct: 20,
          depreciation: 0,
          finance_cost: 0,
          other_income: 0,
          exceptional_items: 0,
          tax_pct: 25,
        }),
      ];
      const result = strategy.computeFields(data, new Set());
      // PBT = 200, PAT = 200 * 0.75 = 150
      expect(result[0].pat).toBe(150);
    });

    it("computes PAT growth", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set());
      // FY24 PAT = 120, FY25 PAT = 150 => growth = 25%
      expect(result[1].pat_growth_pct).toBe(25);
    });

    it("computes PAT margin", () => {
      const data = [
        makeFY({ revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set());
      // PAT = 150, revenue = 1000 => margin = 15%
      expect(result[0].pat_margin_pct).toBe(15);
    });

    it("computes PE when marketCap provided", () => {
      const data = [
        makeFY({ revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set(), 3000);
      // PAT = 150, PE = 3000/150 = 20
      expect(result[0].pe).toBe(20);
    });

    it("computes PEG from PE and PAT growth", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set(), 3000);
      // PE = 3000/150 = 20, PAT growth = 25%, PEG = 20/25 = 0.8
      expect(result[1].peg).toBe(0.8);
    });

    it("respects overrides (does not overwrite)", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 20, ebitda: 999 })];
      const overrides = new Set(["ebitda-0"]);
      const result = strategy.computeFields(data, overrides);
      expect(result[0].ebitda).toBe(999);
    });

    it("handles null revenue", () => {
      const data = [makeFY({ revenue: null })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].ebitda).toBeNull();
    });

    it("handles null ebitda_margin_pct", () => {
      const data = [makeFY({ ebitda_margin_pct: null })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].ebitda).toBeNull();
    });

    it("handles zero previous revenue (no growth calc)", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 0 }),
        makeFY({ year: "FY25", revenue: 1000 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].revenue_growth_pct).toBeNull();
    });

    it("handles null tax_pct (no PAT calc)", () => {
      const data = [makeFY({ tax_pct: null })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].pat).toBeNull();
    });

    it("PE is null when marketCap not provided", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].pe).toBeNull();
    });

    it("PE is null when PAT is 0", () => {
      const data = [makeFY({ revenue: 0, ebitda_margin_pct: 0, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 })];
      const result = strategy.computeFields(data, new Set(), 3000);
      expect(result[0].pe).toBeNull();
    });

    it("computes with null depreciation/finance_cost/other_income/exceptional_items (defaults to 0)", () => {
      const data = [
        makeFY({
          revenue: 1000,
          ebitda_margin_pct: 20,
          depreciation: null,
          finance_cost: null,
          other_income: null,
          exceptional_items: null,
          tax_pct: 25,
        }),
      ];
      const result = strategy.computeFields(data, new Set());
      // EBITDA = 200, PBT = 200 - 0 - 0 + 0 + 0 = 200
      expect(result[0].pbt).toBe(200);
      expect(result[0].pat).toBe(150);
    });

    it("handles overrides for all auto fields", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800, ebitda_margin_pct: 20 }),
        makeFY({
          year: "FY25",
          revenue: 1000,
          ebitda_margin_pct: 20,
          revenue_growth_pct: 99,
          ebitda: 999,
          ebitda_growth_pct: 99,
          pbt: 999,
          pat: 999,
          pat_growth_pct: 99,
          pat_margin_pct: 99,
          pe: 99,
          peg: 99,
        }),
      ];
      const overrides = new Set([
        "revenue_growth_pct-1",
        "ebitda-1",
        "ebitda_growth_pct-1",
        "pbt-1",
        "pat-1",
        "pat_growth_pct-1",
        "pat_margin_pct-1",
        "pe-1",
        "peg-1",
      ]);
      const result = strategy.computeFields(data, overrides, 3000);
      expect(result[1].revenue_growth_pct).toBe(99);
      expect(result[1].ebitda).toBe(999);
      expect(result[1].ebitda_growth_pct).toBe(99);
      expect(result[1].pbt).toBe(999);
      expect(result[1].pat).toBe(999);
      expect(result[1].pat_growth_pct).toBe(99);
      expect(result[1].pat_margin_pct).toBe(99);
      expect(result[1].pe).toBe(99);
      expect(result[1].peg).toBe(99);
    });

    it("PAT margin is null when revenue is 0", () => {
      const data = [
        makeFY({
          revenue: 0,
          ebitda_margin_pct: 0,
          depreciation: 0,
          finance_cost: 0,
          other_income: 0,
          exceptional_items: 0,
          tax_pct: 25,
        }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].pat_margin_pct).toBeNull();
    });

    it("handles null prev PAT (no PAT growth calc)", () => {
      const data = [
        makeFY({ year: "FY24", revenue: null, ebitda_margin_pct: null }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].pat_growth_pct).toBeNull();
    });

    it("PEG is null when PAT growth is 0", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 20, depreciation: 0, finance_cost: 0, other_income: 0, exceptional_items: 0, tax_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set(), 3000);
      expect(result[1].peg).toBeNull();
    });
  });

  describe("getValuationFields", () => {
    it("returns valuation field configs", () => {
      const fields = strategy.getValuationFields();
      const keys = fields.map((f) => f.key);
      expect(keys).toContain("target_pe");
      expect(keys).toContain("target_market_cap");
      expect(keys).toContain("irr");
      expect(keys).toContain("buying_market_cap");
      expect(keys).toContain("buy_price");
    });

    it("target_pe is input, others are derived", () => {
      const fields = strategy.getValuationFields();
      expect(fields.find((f) => f.key === "target_pe")!.isInput).toBe(true);
      expect(fields.find((f) => f.key === "target_market_cap")!.isInput).toBe(false);
    });
  });

  describe("computeValuationDerived", () => {
    const company = {
      market_cap: 1000,
      current_price: 500,
      expected_returns: 15,
      investment_horizon_years: 3,
    };

    it("computes target market cap from PE * PAT", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived({ target_pe: 25 }, terminal, company);
      expect(result.target_market_cap).toBe(2500);
    });

    it("computes IRR", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived({ target_pe: 25 }, terminal, company);
      expect(result.irr).not.toBeNull();
      expect(result.irr!).toBeGreaterThan(0);
    });

    it("computes buying market cap", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived({ target_pe: 25 }, terminal, company);
      expect(result.buying_market_cap).not.toBeNull();
    });

    it("computes buy price", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived({ target_pe: 25 }, terminal, company);
      expect(result.buy_price).not.toBeNull();
      expect(result.buy_price!).toBeGreaterThan(0);
    });

    it("returns null fields when target_pe is null", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived({ target_pe: null }, terminal, company);
      expect(result.target_market_cap).toBeNull();
      expect(result.irr).toBeNull();
    });

    it("returns null fields when terminal year is null", () => {
      const result = strategy.computeValuationDerived({ target_pe: 25 }, null, company);
      expect(result.target_market_cap).toBeNull();
    });

    it("returns null IRR when market_cap is 0", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived(
        { target_pe: 25 },
        terminal,
        { ...company, market_cap: 0 }
      );
      expect(result.irr).toBeNull();
    });

    it("returns null buy_price when current_price is null", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived(
        { target_pe: 25 },
        terminal,
        { ...company, current_price: null }
      );
      expect(result.buy_price).toBeNull();
    });

    it("returns null buying MC when expected_returns is null", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived(
        { target_pe: 25 },
        terminal,
        { ...company, expected_returns: null }
      );
      expect(result.buying_market_cap).toBeNull();
    });

    it("returns null buying MC when horizon is null", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived(
        { target_pe: 25 },
        terminal,
        { ...company, investment_horizon_years: null }
      );
      expect(result.buying_market_cap).toBeNull();
    });

    it("returns null IRR when horizon is 0", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived(
        { target_pe: 25 },
        terminal,
        { ...company, investment_horizon_years: 0 }
      );
      expect(result.irr).toBeNull();
    });

    it("returns null IRR when market_cap is null", () => {
      const terminal = makeFY({ pat: 100 });
      const result = strategy.computeValuationDerived(
        { target_pe: 25 },
        terminal,
        { ...company, market_cap: null }
      );
      expect(result.irr).toBeNull();
    });
  });

  describe("terminal metric helpers", () => {
    it("getTerminalMetricLabel returns Terminal PAT", () => {
      expect(strategy.getTerminalMetricLabel()).toBe("Terminal PAT");
    });

    it("getTerminalMetricValue returns PAT", () => {
      expect(strategy.getTerminalMetricValue(makeFY({ pat: 150 }))).toBe(150);
    });

    it("getTerminalMetricValue returns null for null terminal", () => {
      expect(strategy.getTerminalMetricValue(null)).toBeNull();
    });
  });

  describe("computeHorizonPeg", () => {
    it("delegates to computeHorizonPegMetrics", () => {
      // This just delegates, so basic coverage is sufficient
      expect(strategy.computeHorizonPeg([], null)).toBeNull();
    });
  });
});
