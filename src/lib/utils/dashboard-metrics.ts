import type { AllocationRanges, AllocationRange } from "@/types/database";
import type { DashboardCompanyRow } from "@/hooks/use-dashboard-data";
import {
  effectiveBuyPrice,
  marginOfSafety,
  computeLiveIrr,
  getRangeForStar,
  getAllocationStatus,
  type AllocationStatus,
} from "@/lib/utils/calculations";

type Scenario = {
  scenario_type: string;
  target_market_cap: number | null;
  irr: number | null;
  buy_price: number | null;
};

/** Valuation scenarios of the company's default projection model. */
export function getDefaultScenarios(company: {
  projection_models: { is_default: boolean; valuation_scenarios: Scenario[] }[];
}): Scenario[] {
  return company.projection_models?.find((pm) => pm.is_default)?.valuation_scenarios ?? [];
}

/** Live-computed IRR for a scenario, falling back to the stored value. */
export function getScenarioReturn(
  scenarios: Scenario[],
  type: "base" | "bare",
  currentMarketCapRaw: number | null,
  horizon: number | null
): number | null {
  const s = scenarios.find((v) => v.scenario_type === type);
  if (!s) return null;
  return computeLiveIrr(s.target_market_cap, currentMarketCapRaw, horizon) ?? s.irr ?? null;
}

/** Everything the mobile card and its sort/filter need for one company row. */
export type HoldingMetrics = {
  price: number | null;
  buyPrice: number | null;
  /** Margin of safety as a decimal (0.08 = +8%). */
  mos: number | null;
  /** Base-case return as a percentage number (14 = 14%). */
  baseReturn: number | null;
  invested: number | null;
  currentValue: number | null;
  pnlAmt: number | null;
  /** P&L as a percentage number. */
  pnlPct: number | null;
  /** Weight in the portfolio by current market value, as a percentage number. */
  valuePct: number;
  allocStatus: AllocationStatus;
  range: AllocationRange;
};

/**
 * Compute all derived figures for one company row. Works for both holdings
 * (quantity present) and watchlist (quantity null → position figures are null,
 * but research figures — buy price, MoS, base return — are still computed).
 */
export function computeHoldingMetrics(
  company: DashboardCompanyRow,
  ranges: AllocationRanges,
  totalValue: number
): HoldingMetrics {
  const price = company.indian_stocks?.price ?? null;
  const marketCap = company.indian_stocks?.market_cap ?? null;
  const scenarios = getDefaultScenarios(company);

  const buyPrice = effectiveBuyPrice(company.buy_price, scenarios);
  const mos = buyPrice != null && price != null ? marginOfSafety(buyPrice, price) : null;
  const baseReturn = getScenarioReturn(scenarios, "base", marketCap, company.investment_horizon_years);

  const qty = company.quantity ?? 0;
  const avg = company.avg_buy_price ?? 0;
  const invested = qty > 0 && avg > 0 ? qty * avg : null;
  const currentValue = qty > 0 && price != null ? qty * price : null;
  const pnlAmt = invested != null && currentValue != null ? currentValue - invested : null;
  const pnlPct = invested != null && currentValue != null ? ((currentValue - invested) / invested) * 100 : null;

  const valueAmt = qty * (price ?? 0);
  const valuePct = totalValue > 0 ? (valueAmt / totalValue) * 100 : 0;
  const range = getRangeForStar(company.star_rating, ranges);
  const allocStatus = getAllocationStatus(valuePct, range);

  return { price, buyPrice, mos, baseReturn, invested, currentValue, pnlAmt, pnlPct, valuePct, allocStatus, range };
}

/** Sum of current market value across rows — the denominator for allocation. */
export function totalCurrentValue(companies: DashboardCompanyRow[]): number {
  let total = 0;
  for (const c of companies) {
    const qty = c.quantity ?? 0;
    const price = c.indian_stocks?.price;
    if (qty > 0 && price != null) total += qty * price;
  }
  return total;
}

export type HoldingSortField = "pnl" | "value" | "mos" | "base";

/** Sortable numeric value for a row, or null when the field can't be computed. */
export function holdingSortValue(m: HoldingMetrics, field: HoldingSortField): number | null {
  switch (field) {
    case "pnl":
      return m.pnlPct;
    case "value":
      return m.currentValue;
    case "mos":
      return m.mos;
    case "base":
      return m.baseReturn;
  }
}
