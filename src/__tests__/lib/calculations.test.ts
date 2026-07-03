import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  marginOfSafety,
  irr,
  forwardPeg,
  currentPe,
  cagrGrowth,
  isBuySignal,
  getBaseCaseBuyPrice,
  getDefaultModelBuyPrice,
  getDefaultModelIRR,
  computeLiveIrr,
  computeLiveBuyPrice,
  effectiveBuyPrice,
  computeHorizonPegMetrics,
  marketCapInCrores,
  fmtMarketCap,
  fmtPrice,
  fmtPriceShort,
  fmtAmountShort,
  fmtPct,
  fmtPctShort,
  fmtIrr,
  fmtNum,
  roundPrice,
  getEffectiveRanges,
  getRangeForStar,
  getAllocationStatus,
  getAllocationDelta,
} from "@/lib/utils/calculations";
import { DEFAULT_ALLOCATION_RANGES } from "@/types/database";

// --- marginOfSafety ---
describe("marginOfSafety", () => {
  it("calculates MoS correctly", () => {
    expect(marginOfSafety(100, 80)).toBeCloseTo(0.2);
  });

  it("returns negative MoS when current > buy", () => {
    expect(marginOfSafety(100, 120)).toBeCloseTo(-0.2);
  });

  it("returns 0 when buyPrice is 0", () => {
    expect(marginOfSafety(0, 80)).toBe(0);
  });

  it("returns 1 when currentPrice is 0", () => {
    expect(marginOfSafety(100, 0)).toBe(1);
  });

  it("returns 0 when prices are equal", () => {
    expect(marginOfSafety(100, 100)).toBe(0);
  });
});

// --- irr ---
describe("irr", () => {
  it("calculates IRR correctly", () => {
    // 100 to 200 in 3 years => ~26%
    const result = irr(200, 100, 3);
    expect(result).toBeCloseTo(0.2599, 3);
  });

  it("returns 0 when buyingMcap is 0", () => {
    expect(irr(200, 0, 3)).toBe(0);
  });

  it("returns 0 when years is 0", () => {
    expect(irr(200, 100, 0)).toBe(0);
  });

  it("handles equal target and buying mcap", () => {
    expect(irr(100, 100, 5)).toBe(0);
  });
});

// --- forwardPeg ---
describe("forwardPeg", () => {
  it("calculates forward PEG", () => {
    expect(forwardPeg(20, 0.15)).toBeCloseTo(20 / 15, 3);
  });

  it("returns 0 when cagrPatGrowth is 0", () => {
    expect(forwardPeg(20, 0)).toBe(0);
  });
});

// --- currentPe ---
describe("currentPe", () => {
  it("calculates P/E ratio", () => {
    expect(currentPe(1000, 50)).toBe(20);
  });

  it("returns 0 when latestPat is 0", () => {
    expect(currentPe(1000, 0)).toBe(0);
  });
});

// --- cagrGrowth ---
describe("cagrGrowth", () => {
  it("calculates CAGR correctly", () => {
    const result = cagrGrowth(200, 100, 3);
    expect(result).toBeCloseTo(0.2599, 3);
  });

  it("returns 0 when baseValue is 0", () => {
    expect(cagrGrowth(200, 0, 3)).toBe(0);
  });

  it("returns 0 when years is 0", () => {
    expect(cagrGrowth(200, 100, 0)).toBe(0);
  });
});

// --- isBuySignal ---
describe("isBuySignal", () => {
  it("returns true when currentPrice <= buyPrice", () => {
    expect(isBuySignal(80, 100)).toBe(true);
    expect(isBuySignal(100, 100)).toBe(true);
  });

  it("returns false when currentPrice > buyPrice", () => {
    expect(isBuySignal(120, 100)).toBe(false);
  });

  it("returns false when currentPrice is null", () => {
    expect(isBuySignal(null, 100)).toBe(false);
  });

  it("returns false when buyPrice is null", () => {
    expect(isBuySignal(100, null)).toBe(false);
  });

  it("returns false when both are null", () => {
    expect(isBuySignal(null, null)).toBe(false);
  });

  it("returns false when currentPrice is 0 (falsy)", () => {
    expect(isBuySignal(0, 100)).toBe(false);
  });
});

// --- getBaseCaseBuyPrice ---
describe("getBaseCaseBuyPrice", () => {
  it("returns buy_price from base scenario", () => {
    const scenarios = [
      { scenario_type: "bull", buy_price: 200 },
      { scenario_type: "base", buy_price: 150 },
      { scenario_type: "bare", buy_price: 100 },
    ];
    expect(getBaseCaseBuyPrice(scenarios)).toBe(150);
  });

  it("returns null when no base scenario", () => {
    const scenarios = [{ scenario_type: "bull", buy_price: 200 }];
    expect(getBaseCaseBuyPrice(scenarios)).toBeNull();
  });

  it("returns null when base has null buy_price", () => {
    const scenarios = [{ scenario_type: "base", buy_price: null }];
    expect(getBaseCaseBuyPrice(scenarios)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(getBaseCaseBuyPrice([])).toBeNull();
  });
});

// --- getDefaultModelBuyPrice ---
describe("getDefaultModelBuyPrice", () => {
  it("returns buy_price from default model base scenario", () => {
    const models = [
      {
        is_default: false,
        valuation_scenarios: [{ scenario_type: "base", buy_price: 200 }],
      },
      {
        is_default: true,
        valuation_scenarios: [{ scenario_type: "base", buy_price: 150 }],
      },
    ] as any;
    expect(getDefaultModelBuyPrice(models)).toBe(150);
  });

  it("returns null when no default model", () => {
    const models = [
      {
        is_default: false,
        valuation_scenarios: [{ scenario_type: "base", buy_price: 200 }],
      },
    ] as any;
    expect(getDefaultModelBuyPrice(models)).toBeNull();
  });

  it("returns null when default model has no scenarios", () => {
    const models = [{ is_default: true }] as any;
    expect(getDefaultModelBuyPrice(models)).toBeNull();
  });
});

// --- getDefaultModelIRR ---
describe("getDefaultModelIRR", () => {
  it("computes live IRR from default model base scenario", () => {
    const models = [
      {
        is_default: true,
        valuation_scenarios: [
          { scenario_type: "base", target_market_cap: 200, irr: 10 },
        ],
      },
    ] as any;
    // currentMarketCapRaw = 100 * 1e7 (100 Cr in raw), horizon = 3
    const result = getDefaultModelIRR(models, 100 * 1e7, 3);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(0);
  });

  it("falls back to stored irr when live computation not possible", () => {
    const models = [
      {
        is_default: true,
        valuation_scenarios: [
          { scenario_type: "base", target_market_cap: null, irr: 15.5 },
        ],
      },
    ] as any;
    expect(getDefaultModelIRR(models, null, null)).toBe(15.5);
  });

  it("returns null when no default model", () => {
    expect(getDefaultModelIRR([] as any)).toBeNull();
  });

  it("returns null when no base scenario in default model", () => {
    const models = [
      {
        is_default: true,
        valuation_scenarios: [{ scenario_type: "bull", target_market_cap: 200, irr: 20 }],
      },
    ] as any;
    expect(getDefaultModelIRR(models)).toBeNull();
  });
});

// --- computeLiveIrr ---
describe("computeLiveIrr", () => {
  it("computes IRR as percentage", () => {
    // 200 Cr target, 100 Cr current (1e9 raw), 3 years
    const result = computeLiveIrr(200, 100 * 1e7, 3);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(26.0, 0);
  });

  it("returns null when targetMarketCapCr is null", () => {
    expect(computeLiveIrr(null, 100 * 1e7, 3)).toBeNull();
  });

  it("returns null when currentMarketCapRaw is null", () => {
    expect(computeLiveIrr(200, null, 3)).toBeNull();
  });

  it("returns null when current MC is 0", () => {
    expect(computeLiveIrr(200, 0, 3)).toBeNull();
  });

  it("returns null when horizon is null", () => {
    expect(computeLiveIrr(200, 100 * 1e7, null)).toBeNull();
  });

  it("returns null when horizon is 0", () => {
    expect(computeLiveIrr(200, 100 * 1e7, 0)).toBeNull();
  });

  it("returns null for Infinity result", () => {
    expect(computeLiveIrr(200, -1, 3)).toBeNull();
  });

  it("returns null when the result is not finite (negative target yields NaN)", () => {
    // Passes the guard (curMC > 0) but a negative target makes Math.pow NaN.
    expect(computeLiveIrr(-100, 100 * 1e7, 3)).toBeNull();
  });
});

// --- computeLiveBuyPrice ---
describe("computeLiveBuyPrice", () => {
  it("computes buy price correctly", () => {
    // targetMC=200Cr, curMCRaw=100Cr=1e9, curPrice=500, expReturns=15%, horizon=3
    const result = computeLiveBuyPrice(200, 1e9, 500, 15, 3);
    expect(result).not.toBeNull();
    expect(typeof result).toBe("number");
    expect(result! > 0).toBe(true);
  });

  it("returns null when targetMarketCapCr is null", () => {
    expect(computeLiveBuyPrice(null, 1e9, 500, 15, 3)).toBeNull();
  });

  it("returns null when currentMarketCapRaw is null", () => {
    expect(computeLiveBuyPrice(200, null, 500, 15, 3)).toBeNull();
  });

  it("returns null when currentPrice is null", () => {
    expect(computeLiveBuyPrice(200, 1e9, null, 15, 3)).toBeNull();
  });

  it("returns null when expectedReturnsPct is null", () => {
    expect(computeLiveBuyPrice(200, 1e9, 500, null, 3)).toBeNull();
  });

  it("returns null when horizon is null", () => {
    expect(computeLiveBuyPrice(200, 1e9, 500, 15, null)).toBeNull();
  });

  it("returns null when curMC is 0", () => {
    expect(computeLiveBuyPrice(200, 0, 500, 15, 3)).toBeNull();
  });

  it("returns rounded integer", () => {
    const result = computeLiveBuyPrice(200, 1e9, 500, 15, 3);
    expect(result).toBe(Math.round(result!));
  });

  it("returns null when the buy price is not finite (-100% return divides by zero)", () => {
    // expectedReturnsPct = -100 → (1 + -1)^h = 0 → buyingMC = target / 0 = Infinity.
    expect(computeLiveBuyPrice(200, 1e9, 500, -100, 3)).toBeNull();
  });
});

// --- effectiveBuyPrice ---
describe("effectiveBuyPrice", () => {
  it("returns company buy price when set", () => {
    const scenarios = [{ scenario_type: "base", buy_price: 150 }];
    expect(effectiveBuyPrice(200, scenarios)).toBe(200);
  });

  it("falls back to base scenario when company buy price is null", () => {
    const scenarios = [{ scenario_type: "base", buy_price: 150 }];
    expect(effectiveBuyPrice(null, scenarios)).toBe(150);
  });

  it("returns null when both are null", () => {
    expect(effectiveBuyPrice(null, [])).toBeNull();
  });
});

// --- getDefaultModelIRR additional branches ---
describe("getDefaultModelIRR (additional branches)", () => {
  it("returns live IRR when computeLiveIrr succeeds but base.irr is also set", () => {
    const models = [
      {
        is_default: true,
        valuation_scenarios: [
          { scenario_type: "base", target_market_cap: 200, irr: 10 },
        ],
      },
    ] as any;
    // Live IRR should be computed, overriding stored irr
    const result = getDefaultModelIRR(models, 100 * 1e7, 3);
    expect(result).not.toBe(10); // Should be live-computed, not the stored value
    expect(result).not.toBeNull();
  });

  it("returns null when default model has no valuation_scenarios property", () => {
    const models = [{ is_default: true, valuation_scenarios: undefined }] as any;
    expect(getDefaultModelIRR(models)).toBeNull();
  });

  it("returns null when the default model has scenarios but no base case", () => {
    const models = [
      {
        is_default: true,
        valuation_scenarios: [{ scenario_type: "bull", target_market_cap: 300, irr: 20 }],
      },
    ] as any;
    expect(getDefaultModelIRR(models, 100 * 1e7, 3)).toBeNull();
  });

  it("returns null when live IRR cannot be computed and stored base irr is also null", () => {
    const models = [
      {
        is_default: true,
        valuation_scenarios: [{ scenario_type: "base", target_market_cap: null, irr: null }],
      },
    ] as any;
    // computeLiveIrr → null (target null), base.irr → null → final fallback null.
    expect(getDefaultModelIRR(models, 100 * 1e7, 3)).toBeNull();
  });
});

// --- computeHorizonPegMetrics ---
describe("computeHorizonPegMetrics", () => {
  let realDate: typeof Date;

  beforeEach(() => {
    // Mock Date to June 2026 (month >= 3, so currentFYNum = 27, prevFYNum = 26)
    realDate = globalThis.Date;
    const mockDate = new Date(2026, 5, 15); // June 15, 2026
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes horizon PEG metrics correctly", () => {
    const financialYears = [
      { year: "FY25", pat: 80 },
      { year: "FY26", pat: 100 },
      { year: "FY27E", pat: 120 },
      { year: "FY28E", pat: 150 },
    ] as any;
    const marketCap = 2000;

    const result = computeHorizonPegMetrics(financialYears, marketCap);
    expect(result).not.toBeNull();
    expect(result!.currentPe).toBe(20); // 2000/100
    expect(result!.earningsCagr).not.toBeNull();
    expect(result!.forwardPeg).not.toBeNull();
  });

  it("returns null when fewer than 2 financial years", () => {
    expect(computeHorizonPegMetrics([{ year: "FY26", pat: 100 }] as any, 2000)).toBeNull();
  });

  it("returns null when marketCap is null", () => {
    const fys = [{ year: "FY25", pat: 80 }, { year: "FY26", pat: 100 }] as any;
    expect(computeHorizonPegMetrics(fys, null)).toBeNull();
  });

  it("returns null when previous year not found", () => {
    const fys = [{ year: "FY24", pat: 80 }, { year: "FY25", pat: 100 }] as any;
    expect(computeHorizonPegMetrics(fys, 2000)).toBeNull();
  });

  it("handles zero PAT in previous year (null PE)", () => {
    const fys = [
      { year: "FY26", pat: 0 },
      { year: "FY28E", pat: 100 },
    ] as any;
    const result = computeHorizonPegMetrics(fys, 2000);
    expect(result).not.toBeNull();
    expect(result!.currentPe).toBeNull();
  });

  it("returns null when terminal year has no FY match", () => {
    const fys = [
      { year: "FY26", pat: 100 },
      { year: "invalid", pat: 150 },
    ] as any;
    expect(computeHorizonPegMetrics(fys, 2000)).toBeNull();
  });

  it("returns null when n <= 0 (terminal year same as prev)", () => {
    const fys = [
      { year: "FY26", pat: 100 },
      { year: "FY26", pat: 100 },
    ] as any;
    expect(computeHorizonPegMetrics(fys, 2000)).toBeNull();
  });

  it("handles Jan-March date (month < 3, currentFYNum uses current year)", () => {
    vi.useRealTimers();
    // Mock to January 2026 → month=0 < 3, so currentFYNum = 26, prevFYNum = 25
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15)); // Jan 15, 2026

    const fys = [
      { year: "FY24", pat: 80 },
      { year: "FY25", pat: 100 },
      { year: "FY28E", pat: 150 },
    ] as any;
    const result = computeHorizonPegMetrics(fys, 2000);
    expect(result).not.toBeNull();
    expect(result!.currentPe).toBe(20); // 2000/100
  });

  it("returns null earningsCagr when terminal PAT is null", () => {
    const fys = [
      { year: "FY26", pat: 100 },
      { year: "FY28E", pat: null },
    ] as any;
    const result = computeHorizonPegMetrics(fys, 2000);
    expect(result).not.toBeNull();
    expect(result!.earningsCagr).toBeNull();
  });

  it("returns null forwardPeg when earningsCagr is 0", () => {
    const fys = [
      { year: "FY26", pat: 100 },
      { year: "FY28E", pat: 100 }, // same PAT = 0% growth
    ] as any;
    const result = computeHorizonPegMetrics(fys, 2000);
    // earningsCagr = 0, so forwardPeg should be null
    expect(result).not.toBeNull();
    expect(result!.forwardPeg).toBeNull();
  });

  it("handles FY matching with E suffix", () => {
    const fys = [
      { year: "FY26E", pat: 100 },
      { year: "FY28E", pat: 150 },
    ] as any;
    const result = computeHorizonPegMetrics(fys, 2000);
    expect(result).not.toBeNull();
  });

  it("handles year that doesn't match FY pattern", () => {
    const fys = [
      { year: "2026", pat: 100 },
      { year: "FY28E", pat: 150 },
    ] as any;
    // First year doesn't match, so prevYear won't be found
    const result = computeHorizonPegMetrics(fys, 2000);
    expect(result).toBeNull();
  });
});

// --- marketCapInCrores ---
describe("marketCapInCrores", () => {
  it("converts raw rupees to crores", () => {
    expect(marketCapInCrores(1e9)).toBe(100);
  });

  it("returns null for null", () => {
    expect(marketCapInCrores(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(marketCapInCrores(undefined)).toBeNull();
  });

  it("handles 0", () => {
    expect(marketCapInCrores(0)).toBe(0);
  });
});

// --- Formatting functions ---
describe("fmtMarketCap", () => {
  it("formats market cap in crores", () => {
    const result = fmtMarketCap(1e11); // 10000 Cr
    expect(result).toContain("10,000");
    expect(result).toContain("Cr");
    expect(result).toContain("₹");
  });

  it("returns dash for null", () => {
    expect(fmtMarketCap(null)).toBe("-");
  });
});

describe("fmtPrice", () => {
  it("formats price with rupee symbol", () => {
    expect(fmtPrice(1234.5)).toContain("₹");
    expect(fmtPrice(1234.5)).toContain("1,234.5");
  });

  it("returns dash for null", () => {
    expect(fmtPrice(null)).toBe("-");
  });
});

describe("fmtPriceShort", () => {
  it("formats price without symbol", () => {
    const result = fmtPriceShort(1234.5);
    expect(result).not.toContain("₹");
    expect(result).toContain("1,234.5");
  });

  it("returns dash for null", () => {
    expect(fmtPriceShort(null)).toBe("-");
  });
});

describe("fmtAmountShort", () => {
  it("formats amount as integer", () => {
    expect(fmtAmountShort(1234.7)).toContain("1,235");
  });

  it("returns dash for null", () => {
    expect(fmtAmountShort(null)).toBe("-");
  });
});

describe("fmtPct", () => {
  it("formats decimal as percentage", () => {
    expect(fmtPct(0.25)).toBe("25.0%");
  });

  it("returns dash for null", () => {
    expect(fmtPct(null)).toBe("-");
  });

  it("returns dash for Infinity", () => {
    expect(fmtPct(Infinity)).toBe("-");
  });

  it("handles negative values", () => {
    expect(fmtPct(-0.1)).toBe("-10.0%");
  });
});

describe("fmtPctShort", () => {
  it("formats decimal as percentage without decimals", () => {
    expect(fmtPctShort(0.25)).toBe("25%");
  });

  it("returns dash for null", () => {
    expect(fmtPctShort(null)).toBe("-");
  });

  it("returns dash for Infinity", () => {
    expect(fmtPctShort(Infinity)).toBe("-");
  });
});

describe("fmtIrr", () => {
  it("formats IRR percentage value", () => {
    expect(fmtIrr(15.5)).toBe("15.5%");
  });

  it("returns dash for null", () => {
    expect(fmtIrr(null)).toBe("-");
  });

  it("returns dash for Infinity", () => {
    expect(fmtIrr(Infinity)).toBe("-");
  });
});

describe("fmtNum", () => {
  it("formats number with default 2 decimals", () => {
    const result = fmtNum(1234.5);
    expect(result).toContain("1,234.50");
  });

  it("formats with custom decimals", () => {
    const result = fmtNum(1234.567, 1);
    expect(result).toContain("1,234.6");
  });

  it("returns empty string for null", () => {
    expect(fmtNum(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(fmtNum(undefined)).toBe("");
  });

  it("returns empty string for Infinity", () => {
    expect(fmtNum(Infinity)).toBe("");
  });
});

// --- roundPrice ---
describe("roundPrice", () => {
  it("rounds to 2 decimal places", () => {
    expect(roundPrice(123.456)).toBe(123.46);
  });

  it("handles exact values", () => {
    expect(roundPrice(100)).toBe(100);
  });

  it("handles negative values", () => {
    expect(roundPrice(-5.555)).toBe(-5.55);
  });
});

// --- Allocation helpers ---
describe("getEffectiveRanges", () => {
  it("returns user ranges when provided", () => {
    const custom = { "1": { min: 1, max: 3 } };
    expect(getEffectiveRanges(custom)).toEqual(custom);
  });

  it("returns default ranges when null", () => {
    expect(getEffectiveRanges(null)).toEqual(DEFAULT_ALLOCATION_RANGES);
  });
});

describe("getRangeForStar", () => {
  it("returns correct range for star rating", () => {
    expect(getRangeForStar(3, DEFAULT_ALLOCATION_RANGES)).toEqual({ min: 4, max: 6 });
  });

  it("defaults to star 1 when null", () => {
    expect(getRangeForStar(null, DEFAULT_ALLOCATION_RANGES)).toEqual({ min: 0, max: 2 });
  });

  it("returns default range for unknown star", () => {
    expect(getRangeForStar(99, DEFAULT_ALLOCATION_RANGES)).toEqual({ min: 0, max: 2 });
  });
});

describe("getAllocationStatus", () => {
  it("returns 'under' when below min", () => {
    expect(getAllocationStatus(1, { min: 2, max: 4 })).toBe("under");
  });

  it("returns 'in_range' when within range", () => {
    expect(getAllocationStatus(3, { min: 2, max: 4 })).toBe("in_range");
  });

  it("returns 'in_range' at min boundary", () => {
    expect(getAllocationStatus(2, { min: 2, max: 4 })).toBe("in_range");
  });

  it("returns 'in_range' at max boundary", () => {
    expect(getAllocationStatus(4, { min: 2, max: 4 })).toBe("in_range");
  });

  it("returns 'over' when above max", () => {
    expect(getAllocationStatus(5, { min: 2, max: 4 })).toBe("over");
  });
});

describe("getAllocationDelta", () => {
  it("returns 0 when in range", () => {
    expect(getAllocationDelta(3, { min: 2, max: 4 })).toBe(0);
  });

  it("returns negative when under", () => {
    expect(getAllocationDelta(1, { min: 2, max: 4 })).toBe(-1);
  });

  it("returns positive when over", () => {
    expect(getAllocationDelta(6, { min: 2, max: 4 })).toBe(2);
  });

  it("returns 0 at boundaries", () => {
    expect(getAllocationDelta(2, { min: 2, max: 4 })).toBe(0);
    expect(getAllocationDelta(4, { min: 2, max: 4 })).toBe(0);
  });
});
