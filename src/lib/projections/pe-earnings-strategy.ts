import type { FinancialYear, ProjectionType } from "@/types/database";
import type { ProjectionStrategy, RowConfig, ValuationFieldConfig } from "./types";

function round(val: number | null | undefined, decimals = 1): number | null {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * 10 ** decimals) / 10 ** decimals;
}

function oKey(field: string, yearIdx: number): string {
  return `${field}-${yearIdx}`;
}

export class PeEarningsStrategy implements ProjectionStrategy {
  type: ProjectionType = "pe_earnings";
  label = "PE / Earnings";

  rowConfigs: RowConfig[] = [
    { key: "revenue", label: "Revenue", type: "required", format: "number", section: "header" },
    { key: "revenue_growth_pct", label: "Revenue Growth %", type: "auto", format: "percent", locked: true },
    { key: "ebitda_margin_pct", label: "EBITDA Margin %", type: "required", format: "percent" },
    { key: "ebitda", label: "EBITDA", type: "auto", format: "number", section: "subtotal", dividerAbove: true },
    { key: "ebitda_growth_pct", label: "EBITDA Growth %", type: "auto", format: "percent", locked: true },
    { key: "depreciation", label: "Depreciation", type: "required", format: "number", dividerAbove: true },
    { key: "finance_cost", label: "Interest", type: "required", format: "number" },
    { key: "other_income", label: "Other Income", type: "required", format: "number" },
    { key: "exceptional_items", label: "Exceptional Items", type: "input", format: "number" },
    { key: "pbt", label: "Profit before tax", type: "auto", format: "number", section: "subtotal", dividerAbove: true },
    { key: "tax_pct", label: "Tax %", type: "required", format: "percent" },
    { key: "pat", label: "PAT", type: "auto", format: "number", section: "total" },
    { key: "pat_growth_pct", label: "PAT Growth %", type: "auto", format: "percent", locked: true },
    { key: "pat_margin_pct", label: "PAT Margin %", type: "auto", format: "percent", locked: true },
    { key: "pe", label: "PE", type: "auto", format: "ratio", dividerAbove: true, locked: true },
    { key: "peg", label: "PEG", type: "auto", format: "ratio", locked: true },
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

    // Pass 2: EBITDA growth, PBT, PAT
    const pass2 = pass1.map((fy, idx) => {
      const prev = idx > 0 ? pass1[idx - 1] : null;
      const c = { ...fy };

      if (!overrides.has(oKey("ebitda_growth_pct", idx))) {
        c.ebitda_growth_pct =
          c.ebitda != null && prev?.ebitda != null && prev.ebitda !== 0
            ? round(((c.ebitda - prev.ebitda) / prev.ebitda) * 100)
            : null;
      }
      if (!overrides.has(oKey("pbt", idx))) {
        c.pbt =
          c.ebitda != null
            ? round(
                c.ebitda -
                  (c.depreciation ?? 0) -
                  (c.finance_cost ?? 0) +
                  (c.other_income ?? 0) +
                  (c.exceptional_items ?? 0)
              )
            : null;
      }
      if (!overrides.has(oKey("pat", idx))) {
        c.pat =
          c.pbt != null && c.tax_pct != null
            ? round(c.pbt * (1 - c.tax_pct / 100))
            : null;
      }
      return c;
    });

    // Pass 3: PAT growth, PAT margin, PE, PEG
    return pass2.map((fy, idx) => {
      const prev = idx > 0 ? pass2[idx - 1] : null;
      const c = { ...fy };

      if (!overrides.has(oKey("pat_growth_pct", idx))) {
        c.pat_growth_pct =
          c.pat != null && prev?.pat != null && prev.pat !== 0
            ? round(((c.pat - prev.pat) / prev.pat) * 100)
            : null;
      }
      if (!overrides.has(oKey("pat_margin_pct", idx))) {
        c.pat_margin_pct =
          c.pat != null && c.revenue != null && c.revenue !== 0
            ? round((c.pat / c.revenue) * 100)
            : null;
      }
      if (!overrides.has(oKey("pe", idx))) {
        c.pe =
          marketCap != null && c.pat != null && c.pat !== 0
            ? round(marketCap / c.pat, 1)
            : null;
      }
      if (!overrides.has(oKey("peg", idx))) {
        c.peg =
          c.pe != null && c.pat_growth_pct != null && c.pat_growth_pct !== 0
            ? round(c.pe / c.pat_growth_pct, 2)
            : null;
      }
      return c;
    });
  }

  getValuationFields(): ValuationFieldConfig[] {
    return [
      { key: "target_pe", label: "Target PE", isInput: true },
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
    const targetPE = scenarioInputs.target_pe ?? null;
    const terminalPAT = terminalYear?.pat ?? null;
    const curMC = company.market_cap;
    const curPrice = company.current_price;
    const expReturns = company.expected_returns;
    const horizon = company.investment_horizon_years;

    // Target market cap = target PE * terminal PAT
    const targetMC =
      targetPE != null && terminalPAT != null
        ? round(targetPE * terminalPAT, 0)
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
      target_market_cap: targetMC,
      irr,
      buying_market_cap: buyingMC,
      buy_price: buyPrice,
    };
  }

  getTerminalMetricLabel(): string {
    return "Terminal PAT";
  }

  getTerminalMetricValue(terminalYear: FinancialYear | null): number | null {
    return terminalYear?.pat ?? null;
  }
}
