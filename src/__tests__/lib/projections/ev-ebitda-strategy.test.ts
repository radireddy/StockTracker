import { describe, it, expect } from "vitest";
import { EvEbitdaStrategy } from "@/lib/projections/ev-ebitda-strategy";
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
    depreciation: null,
    finance_cost: null,
    other_income: null,
    exceptional_items: null,
    pbt: null,
    tax_pct: null,
    pat: null,
    pat_growth_pct: null,
    pat_margin_pct: null,
    minority_interest: null,
    pat_for_shareholders: null,
    pe: null,
    peg: null,
    net_debt: 50,
    lease_liability: 10,
    total_debt: null,
    ev_ebitda_ratio: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const strategy = new EvEbitdaStrategy();

describe("EvEbitdaStrategy", () => {
  describe("properties", () => {
    it("has correct type and label", () => {
      expect(strategy.type).toBe("ev_ebitda");
      expect(strategy.label).toBe("EV / EBITDA");
    });

    it("has row configs with EV/EBITDA specific fields", () => {
      const keys = strategy.rowConfigs.map((r) => r.key);
      expect(keys).toContain("net_debt");
      expect(keys).toContain("lease_liability");
      expect(keys).toContain("total_debt");
      expect(keys).toContain("ev_ebitda_ratio");
    });
  });

  describe("computeFields", () => {
    it("computes EBITDA from revenue * margin", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 25 })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].ebitda).toBe(250);
    });

    it("computes revenue growth", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800 }),
        makeFY({ year: "FY25", revenue: 1000 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].revenue_growth_pct).toBe(25);
      expect(result[0].revenue_growth_pct).toBeNull();
    });

    it("computes EBITDA growth", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 800, ebitda_margin_pct: 20 }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 25 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].ebitda_growth_pct).not.toBeNull();
    });

    it("computes total_debt as net_debt + lease_liability", () => {
      const data = [makeFY({ net_debt: 100, lease_liability: 20 })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].total_debt).toBe(120);
    });

    it("computes total_debt with only net_debt", () => {
      const data = [makeFY({ net_debt: 100, lease_liability: null })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].total_debt).toBe(100);
    });

    it("computes total_debt with only lease_liability", () => {
      const data = [makeFY({ net_debt: null, lease_liability: 20 })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].total_debt).toBe(20);
    });

    it("total_debt is null when both are null", () => {
      const data = [makeFY({ net_debt: null, lease_liability: null })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].total_debt).toBeNull();
    });

    it("computes EV/EBITDA ratio", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 20, net_debt: 100, lease_liability: 0 })];
      const result = strategy.computeFields(data, new Set(), 2000);
      // EBITDA = 200, total_debt = 100, EV/EBITDA = (2000+100)/200 = 10.5
      expect(result[0].ev_ebitda_ratio).toBe(10.5);
    });

    it("EV/EBITDA is null when EBITDA is 0", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 0, net_debt: 100, lease_liability: 0 })];
      const result = strategy.computeFields(data, new Set(), 2000);
      expect(result[0].ev_ebitda_ratio).toBeNull();
    });

    it("EV/EBITDA is null when marketCap not provided", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 20, net_debt: 100, lease_liability: 0 })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].ev_ebitda_ratio).toBeNull();
    });

    it("respects overrides", () => {
      const data = [makeFY({ total_debt: 999 })];
      const result = strategy.computeFields(data, new Set(["total_debt-0"]));
      expect(result[0].total_debt).toBe(999);
    });

    it("handles null revenue (no EBITDA)", () => {
      const data = [makeFY({ revenue: null })];
      const result = strategy.computeFields(data, new Set());
      expect(result[0].ebitda).toBeNull();
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
          total_debt: 999,
          ev_ebitda_ratio: 99,
        }),
      ];
      const overrides = new Set([
        "revenue_growth_pct-1",
        "ebitda-1",
        "ebitda_growth_pct-1",
        "total_debt-1",
        "ev_ebitda_ratio-1",
      ]);
      const result = strategy.computeFields(data, overrides, 3000);
      expect(result[1].revenue_growth_pct).toBe(99);
      expect(result[1].ebitda).toBe(999);
      expect(result[1].ebitda_growth_pct).toBe(99);
      expect(result[1].total_debt).toBe(999);
      expect(result[1].ev_ebitda_ratio).toBe(99);
    });

    it("EV/EBITDA is null when total_debt is null", () => {
      const data = [makeFY({ revenue: 1000, ebitda_margin_pct: 20, net_debt: null, lease_liability: null })];
      const result = strategy.computeFields(data, new Set(), 2000);
      expect(result[0].ev_ebitda_ratio).toBeNull();
    });

    it("handles null prev EBITDA (no growth calc)", () => {
      const data = [
        makeFY({ year: "FY24", revenue: null, ebitda_margin_pct: null }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 20 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].ebitda_growth_pct).toBeNull();
    });

    it("handles zero prev EBITDA (no growth)", () => {
      const data = [
        makeFY({ year: "FY24", revenue: 1000, ebitda_margin_pct: 0 }),
        makeFY({ year: "FY25", revenue: 1000, ebitda_margin_pct: 20 }),
      ];
      const result = strategy.computeFields(data, new Set());
      expect(result[1].ebitda_growth_pct).toBeNull();
    });
  });

  describe("getValuationFields", () => {
    it("returns EV/EBITDA specific fields", () => {
      const fields = strategy.getValuationFields();
      const keys = fields.map((f) => f.key);
      expect(keys).toContain("target_ev_ebitda_ratio");
      expect(keys).toContain("expected_ev");
      expect(keys).toContain("net_debt_terminal");
      expect(keys).toContain("target_market_cap");
    });

    it("target_ev_ebitda_ratio is input", () => {
      const fields = strategy.getValuationFields();
      expect(fields.find((f) => f.key === "target_ev_ebitda_ratio")!.isInput).toBe(true);
    });
  });

  describe("computeValuationDerived", () => {
    const company = {
      market_cap: 1000,
      current_price: 500,
      expected_returns: 15,
      investment_horizon_years: 3,
    };

    it("computes expected EV = ratio * terminal EBITDA", () => {
      const terminal = makeFY({ ebitda: 200 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15 },
        terminal,
        company
      );
      expect(result.expected_ev).toBe(3000);
    });

    it("computes target MC = expected EV - net debt", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        company
      );
      // EV = 3000, net_debt from terminal = 100, MC = 2900
      expect(result.target_market_cap).toBe(2900);
    });

    it("uses explicit net_debt_terminal over terminal year", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: 50 },
        terminal,
        company
      );
      // EV = 3000, net_debt = 50, MC = 2950
      expect(result.target_market_cap).toBe(2950);
    });

    it("computes IRR", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        company
      );
      expect(result.irr).not.toBeNull();
    });

    it("computes buying MC and buy price", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        company
      );
      expect(result.buying_market_cap).not.toBeNull();
      expect(result.buy_price).not.toBeNull();
    });

    it("returns null when target ratio is null", () => {
      const terminal = makeFY({ ebitda: 200 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: null },
        terminal,
        company
      );
      expect(result.expected_ev).toBeNull();
    });

    it("returns null when terminal year is null", () => {
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15 },
        null,
        company
      );
      expect(result.expected_ev).toBeNull();
    });

    it("returns null IRR when market_cap is null", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        { ...company, market_cap: null }
      );
      expect(result.irr).toBeNull();
    });

    it("returns null buy_price when current_price is null", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        { ...company, current_price: null }
      );
      expect(result.buy_price).toBeNull();
    });

    it("returns null buying_market_cap when expected_returns is null", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        { ...company, expected_returns: null }
      );
      expect(result.buying_market_cap).toBeNull();
    });

    it("returns null buying_market_cap when horizon is null", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        { ...company, investment_horizon_years: null }
      );
      expect(result.buying_market_cap).toBeNull();
    });

    it("returns null IRR when horizon is 0", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        { ...company, investment_horizon_years: 0 }
      );
      expect(result.irr).toBeNull();
    });

    it("returns null target_market_cap when net_debt_terminal is null and terminal has no net_debt", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: null });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15 },
        terminal,
        company
      );
      // net_debt_terminal from inputs is undefined, terminal has null
      expect(result.target_market_cap).toBeNull();
    });

    it("returns null IRR when market_cap is 0", () => {
      const terminal = makeFY({ ebitda: 200, net_debt: 100 });
      const result = strategy.computeValuationDerived(
        { target_ev_ebitda_ratio: 15, net_debt_terminal: null },
        terminal,
        { ...company, market_cap: 0 }
      );
      expect(result.irr).toBeNull();
    });
  });

  describe("terminal metric helpers", () => {
    it("getTerminalMetricLabel returns Terminal EBITDA", () => {
      expect(strategy.getTerminalMetricLabel()).toBe("Terminal EBITDA");
    });

    it("getTerminalMetricValue returns EBITDA", () => {
      expect(strategy.getTerminalMetricValue(makeFY({ ebitda: 200 }))).toBe(200);
    });

    it("getTerminalMetricValue returns null for null terminal", () => {
      expect(strategy.getTerminalMetricValue(null)).toBeNull();
    });
  });
});
