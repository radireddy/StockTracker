import type { ProjectionModel } from "@/types/database";

export function marginOfSafety(
  buyPrice: number,
  currentPrice: number
): number {
  if (buyPrice === 0) return 0;
  return (buyPrice - currentPrice) / buyPrice;
}

export function irr(
  targetMcap: number,
  buyingMcap: number,
  years: number
): number {
  if (buyingMcap === 0 || years === 0) return 0;
  return Math.pow(targetMcap / buyingMcap, 1 / years) - 1;
}

export function forwardPeg(currentPe: number, cagrPatGrowth: number): number {
  if (cagrPatGrowth === 0) return 0;
  return currentPe / (cagrPatGrowth * 100);
}

export function currentPe(marketCap: number, latestPat: number): number {
  if (latestPat === 0) return 0;
  return marketCap / latestPat;
}

export function cagrGrowth(
  futureValue: number,
  baseValue: number,
  years: number
): number {
  if (baseValue === 0 || years === 0) return 0;
  return Math.pow(futureValue / baseValue, 1 / years) - 1;
}

export function isBuySignal(
  currentPrice: number | null,
  buyPrice: number | null
): boolean {
  if (!currentPrice || !buyPrice) return false;
  return currentPrice <= buyPrice;
}

export function getBaseCaseBuyPrice(
  scenarios: { scenario_type: string; buy_price: number | null }[]
): number | null {
  const base = scenarios.find((s) => s.scenario_type === "base");
  return base?.buy_price ?? null;
}

/** Get default model's base case buy price */
export function getDefaultModelBuyPrice(
  projectionModels: ProjectionModel[]
): number | null {
  const defaultModel = projectionModels.find((pm) => pm.is_default);
  if (!defaultModel?.valuation_scenarios) return null;
  return getBaseCaseBuyPrice(defaultModel.valuation_scenarios);
}

/** Get default model's base case IRR */
export function getDefaultModelIRR(
  projectionModels: ProjectionModel[]
): number | null {
  const defaultModel = projectionModels.find((pm) => pm.is_default);
  if (!defaultModel?.valuation_scenarios) return null;
  const base = defaultModel.valuation_scenarios.find((s) => s.scenario_type === "base");
  return base?.irr ?? null;
}

export function effectiveBuyPrice(
  companyBuyPrice: number | null,
  scenarios: { scenario_type: string; buy_price: number | null }[]
): number | null {
  return companyBuyPrice ?? getBaseCaseBuyPrice(scenarios);
}

// --- Financial formatting ---

const IN_LOCALE = "en-IN";

/** Market cap in Cr — whole numbers only */
export function fmtMarketCap(val: number | null): string {
  if (val == null) return "-";
  return `₹${Math.round(val).toLocaleString(IN_LOCALE)} Cr`;
}

/** Price in ₹ — max 2 decimals, drop trailing zeros */
export function fmtPrice(val: number | null): string {
  if (val == null) return "-";
  return `₹${roundPrice(val).toLocaleString(IN_LOCALE)}`;
}

/** Price without ₹ symbol — for table cells where ₹ is implied */
export function fmtPriceShort(val: number | null): string {
  if (val == null) return "-";
  return roundPrice(val).toLocaleString(IN_LOCALE);
}

/** Percentage from decimal (0.25 → "25.0%"). Guards against absurd values. */
export function fmtPct(val: number | null): string {
  if (val == null || !isFinite(val)) return "-";
  return `${(val * 100).toFixed(1)}%`;
}

/** Percentage from decimal, 0 decimal places (0.25 → "25%") */
export function fmtPctShort(val: number | null): string {
  if (val == null || !isFinite(val)) return "-";
  return `${(val * 100).toFixed(0)}%`;
}

/** Number with Indian locale, fixed decimals */
export function fmtNum(val: number | null | undefined, decimals = 2): string {
  if (val == null || !isFinite(val)) return "";
  return val.toLocaleString(IN_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// --- Rounding helpers for save operations ---

/** Round price to 2 decimal places */
export function roundPrice(val: number): number {
  return Math.round(val * 100) / 100;
}
