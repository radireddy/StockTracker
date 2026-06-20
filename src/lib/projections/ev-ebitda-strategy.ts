import type { FinancialYear, ProjectionType } from "@/types/database";
import type { ProjectionStrategy, RowConfig, ValuationFieldConfig } from "./types";

function round(val: number | null | undefined, decimals = 1): number | null {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * 10 ** decimals) / 10 ** decimals;
}

function oKey(field: string, yearIdx: number): string {
  return `${field}-${yearIdx}`;
}

export class EvEbitdaStrategy implements ProjectionStrategy {
  type: ProjectionType = "ev_ebitda";
  label = "EV / EBITDA";

  rowConfigs: RowConfig[] = [
    { key: "revenue", label: "Revenue", type: "required", format: "number", section: "header" },
    { key: "revenue_growth_pct", label: "Revenue Growth %", type: "auto", format: "percent", locked: true },
    { key: "ebitda_margin_pct", label: "EBITDA Margin %", type: "required", format: "percent" },
    { key: "ebitda", label: "EBITDA", type: "auto", format: "number", section: "subtotal", dividerAbove: true },
    { key: "ebitda_growth_pct", label: "EBITDA Growth %", type: "auto", format: "percent", locked: true },
    { key: "net_debt", label: "Net Debt", type: "input", format: "number", dividerAbove: true },
    { key: "lease_liability", label: "Lease Liability", type: "input", format: "number" },
    { key: "total_debt", label: "Total Debt", type: "auto", format: "number", section: "subtotal", overridable: true },
    { key: "ev_ebitda_ratio", label: "EV/EBITDA", type: "auto", format: "ratio", dividerAbove: true, overridable: true },
  ];

  computeFields(
    data: FinancialYear[],
    overrides: Set<string>,
    marketCap?: number | null
  ): FinancialYear[] {
    // Pass 1: EBITDA from revenue * margin, revenue growth from prev year
    const pass1 = data.map((fy, idx) => {
      const prev = idx > 0 ? data[idx - 1] : null;
      const c = { ...fy };

      if (!overrides.has(oKey("ebitda", idx))) {
        c.ebitda =
          c.revenue != null && c.ebitda_margin_pct != null
            ? round((c.revenue * c.ebitda_margin_pct) / 100)
            : null;
      }
      if (!overrides.has(oKey("revenue_growth_pct", idx))) {
        c.revenue_growth_pct =
          c.revenue != null && prev?.revenue != null && prev.revenue !== 0
            ? round(((c.revenue - prev.revenue) / prev.revenue) * 100)
            : null;
      }
      return c;
    });

    // Pass 2: EBITDA growth, total_debt, ev_ebitda_ratio
    return pass1.map((fy, idx) => {
      const prev = idx > 0 ? pass1[idx - 1] : null;
      const c = { ...fy };

      if (!overrides.has(oKey("ebitda_growth_pct", idx))) {
        c.ebitda_growth_pct =
          c.ebitda != null && prev?.ebitda != null && prev.ebitda !== 0
            ? round(((c.ebitda - prev.ebitda) / prev.ebitda) * 100)
            : null;
      }
      if (!overrides.has(oKey("total_debt", idx))) {
        c.total_debt =
          c.net_debt != null || c.lease_liability != null
            ? round((c.net_debt ?? 0) + (c.lease_liability ?? 0), 0)
            : null;
      }
      if (!overrides.has(oKey("ev_ebitda_ratio", idx))) {
        c.ev_ebitda_ratio =
          marketCap != null && c.total_debt != null && c.ebitda != null && c.ebitda !== 0
            ? round((marketCap + c.total_debt) / c.ebitda, 1)
            : null;
      }
      return c;
    });
  }

  getValuationFields(): ValuationFieldConfig[] {
    return [
      { key: "target_ev_ebitda_ratio", label: "Target EV/EBITDA", isInput: true },
      { key: "expected_ev", label: "Expected EV", isInput: false },
      { key: "net_debt_terminal", label: "Net Debt (Terminal)", isInput: false },
      { key: "target_market_cap", label: "Target Market Cap", isInput: false },
      { key: "irr", label: "IRR %", isInput: false },
      { key: "buying_market_cap", label: "Buying Market Cap", isInput: false },
      { key: "buy_price", label: "Buy Price", isInput: false },
    ];
  }

  computeValuationDerived(
    scenarioInputs: Record<string, number | null>,
    terminalYear: FinancialYear | null,
    company: {
      market_cap: number | null;
      current_price: number | null;
      expected_returns: number | null;
      investment_horizon_years: number | null;
    }
  ): Record<string, number | null> {
    const targetRatio = scenarioInputs.target_ev_ebitda_ratio ?? null;
    const terminalEBITDA = terminalYear?.ebitda ?? null;
    const netDebtTerminal = scenarioInputs.net_debt_terminal ?? terminalYear?.net_debt ?? null;
    const curMC = company.market_cap;
    const curPrice = company.current_price;
    const expReturns = company.expected_returns;
    const horizon = company.investment_horizon_years;

    // Expected EV = target ratio * terminal EBITDA
    const expectedEV =
      targetRatio != null && terminalEBITDA != null
        ? round(targetRatio * terminalEBITDA, 0)
        : null;

    // Target market cap = expected EV - net debt (terminal)
    const targetMC =
      expectedEV != null && netDebtTerminal != null
        ? round(expectedEV - netDebtTerminal, 0)
        : null;

    // IRR = (targetMC / curMC)^(1/horizon) - 1
    const irr =
      targetMC != null && curMC != null && curMC > 0 && horizon != null && horizon > 0
        ? round((Math.pow(targetMC / curMC, 1 / horizon) - 1) * 100, 1)
        : null;

    // Buying market cap = targetMC / (1 + expectedReturns)^horizon
    const buyingMC =
      targetMC != null && expReturns != null && horizon != null
        ? round(targetMC / Math.pow(1 + expReturns / 100, horizon), 0)
        : null;

    // Buy price = buyingMC * (curPrice / curMC)
    const buyPrice =
      buyingMC != null && curPrice != null && curMC != null && curMC > 0
        ? round(buyingMC * (curPrice / curMC), 0)
        : null;

    return {
      expected_ev: expectedEV,
      net_debt_terminal: netDebtTerminal,
      target_market_cap: targetMC,
      irr,
      buying_market_cap: buyingMC,
      buy_price: buyPrice,
    };
  }

  getTerminalMetricLabel(): string {
    return "Terminal EBITDA";
  }

  getTerminalMetricValue(terminalYear: FinancialYear | null): number | null {
    return terminalYear?.ebitda ?? null;
  }
}
