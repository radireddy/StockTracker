import type { FinancialYear, ProjectionModel, AllocationRanges, AllocationRange } from "@/types/database";
import { DEFAULT_ALLOCATION_RANGES } from "@/types/database";
import type { HorizonPegMetrics } from "@/lib/projections/types";

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
  projectionModels: ProjectionModel[],
  currentMarketCapRaw?: number | null,
  investmentHorizon?: number | null
): number | null {
  const defaultModel = projectionModels.find((pm) => pm.is_default);
  if (!defaultModel?.valuation_scenarios) return null;
  const base = defaultModel.valuation_scenarios.find((s) => s.scenario_type === "base");
  if (!base) return null;
  return computeLiveIrr(base.target_market_cap, currentMarketCapRaw ?? null, investmentHorizon ?? null) ?? base.irr ?? null;
}

/** Compute IRR live from stored target_market_cap and current market data.
 *  target_market_cap is in Cr, currentMarketCapRaw is in raw rupees from DB. */
export function computeLiveIrr(
  targetMarketCapCr: number | null,
  currentMarketCapRaw: number | null,
  horizon: number | null
): number | null {
  const curMCCr = marketCapInCrores(currentMarketCapRaw);
  if (targetMarketCapCr == null || curMCCr == null || curMCCr <= 0 || horizon == null || horizon <= 0) return null;
  const val = (Math.pow(targetMarketCapCr / curMCCr, 1 / horizon) - 1) * 100;
  if (!isFinite(val)) return null;
  return Math.round(val * 10) / 10;
}

/** Compute buy price live from stored target_market_cap and current market data. */
export function computeLiveBuyPrice(
  targetMarketCapCr: number | null,
  currentMarketCapRaw: number | null,
  currentPrice: number | null,
  expectedReturnsPct: number | null,
  horizon: number | null
): number | null {
  const curMCCr = marketCapInCrores(currentMarketCapRaw);
  if (targetMarketCapCr == null || curMCCr == null || curMCCr <= 0) return null;
  if (currentPrice == null || expectedReturnsPct == null || horizon == null) return null;
  const buyingMC = targetMarketCapCr / Math.pow(1 + expectedReturnsPct / 100, horizon);
  const buyPrice = buyingMC * (currentPrice / curMCCr);
  if (!isFinite(buyPrice)) return null;
  return Math.round(buyPrice);
}

export function effectiveBuyPrice(
  companyBuyPrice: number | null,
  scenarios: { scenario_type: string; buy_price: number | null }[]
): number | null {
  return companyBuyPrice ?? getBaseCaseBuyPrice(scenarios);
}

// --- Horizon PEG ---

/**
 * Compute Forward PEG metrics using previous year (FY before current) and terminal year.
 * - Trailing PE = Market Cap / Previous Year PAT
 * - Earnings CAGR = (Terminal PAT / Previous Year PAT)^(1/n) - 1
 * - Forward PEG = Trailing PE / Earnings CAGR (%)
 * Current FY from calendar, previous year = current FY - 1, n = terminal FY - previous FY.
 */
export function computeHorizonPegMetrics(
  financialYears: FinancialYear[],
  marketCap: number | null
): HorizonPegMetrics | null {
  if (financialYears.length < 2 || marketCap == null) return null;

  // Current FY from calendar (e.g. June 2026 → FY27)
  const now = new Date();
  const currentFYNum = now.getMonth() >= 3
    ? (now.getFullYear() + 1) % 100
    : now.getFullYear() % 100;
  const prevFYNum = currentFYNum - 1;

  // Find previous year in array by FY number (match FY26 or FY26E)
  const prevYear = financialYears.find((fy) => {
    const match = fy.year.match(/FY(\d+)/);
    return match ? parseInt(match[1]) === prevFYNum : false;
  });
  if (!prevYear) return null;

  // Terminal year = last year in array
  const terminalYear = financialYears[financialYears.length - 1];
  const terminalMatch = terminalYear.year.match(/FY(\d+)/);
  if (!terminalMatch) return null;
  const terminalFYNum = parseInt(terminalMatch[1]);

  // n = years between previous year and terminal year
  const n = terminalFYNum - prevFYNum;
  if (n <= 0) return null;

  const prevPat = prevYear.pat;
  const terminalPat = terminalYear.pat;

  // Trailing PE = Market Cap / Previous Year PAT
  const trailingPe =
    prevPat != null && prevPat > 0
      ? Math.round((marketCap / prevPat) * 10) / 10
      : null;

  // Earnings CAGR = (Terminal PAT / Previous Year PAT)^(1/n) - 1
  const earningsCagr =
    prevPat != null && prevPat > 0 && terminalPat != null && terminalPat > 0
      ? Math.round((Math.pow(terminalPat / prevPat, 1 / n) - 1) * 1000) / 10
      : null;

  const fwdPeg =
    trailingPe != null && earningsCagr != null && earningsCagr > 0
      ? Math.round((trailingPe / earningsCagr) * 100) / 100
      : null;

  return { currentPe: trailingPe, earningsCagr, forwardPeg: fwdPeg };
}

// --- Conversion helpers ---

/** Convert market cap from raw rupees (DB/API) to Crores */
export function marketCapInCrores(rawRupees: number | null | undefined): number | null {
  if (rawRupees == null) return null;
  return rawRupees / 1e7;
}

// --- Financial formatting ---

const IN_LOCALE = "en-IN";

/** Market cap in Cr — accepts raw rupees from DB, converts and formats */
export function fmtMarketCap(rawRupees: number | null): string {
  const cr = marketCapInCrores(rawRupees);
  if (cr == null) return "-";
  return `₹${Math.round(cr).toLocaleString(IN_LOCALE)} Cr`;
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

/** Amount without decimals — for totals like Cost, Current Value, P&L */
export function fmtAmountShort(val: number | null): string {
  if (val == null) return "-";
  return Math.round(val).toLocaleString(IN_LOCALE);
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

/** Format IRR stored as percentage number (9.9 → "9.9%"). Used for valuation scenario IRR values. */
export function fmtIrr(val: number | null): string {
  if (val == null || !isFinite(val)) return "-";
  return `${val.toFixed(1)}%`;
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

// --- Allocation helpers ---

export type AllocationStatus = "under" | "in_range" | "over";

/** Get the effective allocation ranges (user overrides or defaults) */
export function getEffectiveRanges(userRanges: AllocationRanges | null): AllocationRanges {
  return userRanges ?? DEFAULT_ALLOCATION_RANGES;
}

/** Get allocation range for a star rating */
export function getRangeForStar(star: number | null, ranges: AllocationRanges): AllocationRange {
  const key = String(star ?? 1);
  return ranges[key] ?? { min: 0, max: 2 };
}

/** Determine allocation status relative to target range */
export function getAllocationStatus(actualPct: number, range: AllocationRange): AllocationStatus {
  if (actualPct < range.min) return "under";
  if (actualPct > range.max) return "over";
  return "in_range";
}

/** Delta from nearest range boundary. 0 if in range, negative if under, positive if over. */
export function getAllocationDelta(actualPct: number, range: AllocationRange): number {
  if (actualPct < range.min) return actualPct - range.min;
  if (actualPct > range.max) return actualPct - range.max;
  return 0;
}
