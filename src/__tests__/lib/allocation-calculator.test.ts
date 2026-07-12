import { describe, it, expect } from "vitest";
import { calculate } from "@/lib/utils/allocation-calculator";
import type { StarInput } from "@/lib/utils/allocation-calculator";

function input(star: 1 | 2 | 3 | 4, count: number, min: number, max: number): StarInput {
  return { star, count, range: { min, max } };
}

describe("calculate", () => {
  it("returns single bucket with correct per-stock and bucket amounts", () => {
    const result = calculate(1_000_000, [input(4, 2, 6, 8)]);
    const bucket = result.buckets[0];
    expect(bucket.star).toBe(4);
    expect(bucket.count).toBe(2);
    expect(bucket.perStockMin).toBeCloseTo(60_000);
    expect(bucket.perStockMax).toBeCloseTo(80_000);
    expect(bucket.bucketMin).toBeCloseTo(120_000);
    expect(bucket.bucketMax).toBeCloseTo(160_000);
    expect(bucket.isAbsolute).toBe(false);
    expect(bucket.hasRangeError).toBe(false);
  });

  it("excludes buckets where count is 0", () => {
    const result = calculate(1_000_000, [
      input(4, 0, 6, 8),
      input(3, 2, 4, 6),
    ]);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].star).toBe(3);
  });

  it("sums totalDeployedMin and totalDeployedMax across active buckets", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 6, 8), // bucket: 120k–160k
      input(3, 3, 4, 6), // bucket: 120k–180k
    ]);
    expect(result.totalDeployedMin).toBeCloseTo(240_000);
    expect(result.totalDeployedMax).toBeCloseTo(340_000);
  });

  it("computes cashBufferMin and cashBufferMax correctly", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 6, 8), // bucket: 120k–160k
    ]);
    // cashBufferMin = max(0, 1M - 160k) = 840k
    expect(result.cashBufferMin).toBeCloseTo(840_000);
    // cashBufferMax = max(0, 1M - 120k) = 880k
    expect(result.cashBufferMax).toBeCloseTo(880_000);
  });

  it("sets isUnderCapitalized when even minimum targets exceed budget", () => {
    // 15 four-star stocks at 6% min = 90%, at 8% max = 120% — min fits but let's go higher
    // 20 four-star stocks at 6% min = 120% → under-capitalized
    const result = calculate(1_000_000, [input(4, 20, 6, 8)]);
    expect(result.isUnderCapitalized).toBe(true);
    expect(result.isBudgetConstrained).toBe(false);
  });

  it("sets isBudgetConstrained when min fits but max exceeds budget", () => {
    // 15 four-star stocks: min 6%×15=90% fits, max 8%×15=120% exceeds
    const result = calculate(1_000_000, [input(4, 15, 6, 8)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(true);
  });

  it("sets neither flag when all targets fit within budget", () => {
    const result = calculate(1_000_000, [input(4, 2, 6, 8)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
  });

  it("computes suggestedPct and suggestedAmount via t-interpolation when budget-constrained", () => {
    // 15 four-star stocks at 6-8%: min 6%×15=90% fits, max 8%×15=120% exceeds budget
    // t = (100% - 90%) / (120% - 90%) = 10/30 = 1/3
    // suggestedPct = 6 + (1/3) × 2 ≈ 6.667%  suggestedAmount ≈ 66,667 per stock
    const result = calculate(1_000_000, [input(4, 15, 6, 8)]);
    expect(result.isBudgetConstrained).toBe(true);
    const bucket = result.buckets[0];
    expect(bucket.suggestedPct).toBeCloseTo(6.667, 2);
    expect(bucket.suggestedAmount).toBeCloseTo(66_667, 0);
  });

  it("suggested total across all buckets equals totalAmount exactly", () => {
    const result = calculate(5_500_000, [
      input(4, 4, 6, 8),
      input(3, 16, 4, 6),
      input(2, 5, 2, 4),
      input(1, 2, 0, 2),
    ]);
    expect(result.isBudgetConstrained).toBe(true);
    const suggestedTotal = result.buckets.reduce(
      (s, b) => s + (b.suggestedAmount ?? 0) * b.count,
      0
    );
    expect(suggestedTotal).toBeCloseTo(5_500_000, 0);
  });

  it("suggestedPct and suggestedAmount are null when not budget-constrained", () => {
    const result = calculate(1_000_000, [input(4, 2, 6, 8)]);
    expect(result.isBudgetConstrained).toBe(false);
    expect(result.buckets[0].suggestedPct).toBeNull();
    expect(result.buckets[0].suggestedAmount).toBeNull();
  });

  it("suggestedPct equals min for an absolute bucket (min === max) in a constrained mix", () => {
    // 1 stock at 60-60% (absolute) + 1 stock at 30-50%:
    // sum(min) = 90% ≤ 100%, sum(max) = 110% > 100% → budget-constrained
    // t = (100-90)/(110-90) = 0.5
    // absolute bucket: suggestedPct = 60 + 0.5×0 = 60%
    const result = calculate(1_000_000, [input(4, 1, 60, 60), input(3, 1, 30, 50)]);
    expect(result.isBudgetConstrained).toBe(true);
    const absolute = result.buckets.find((b) => b.star === 4)!;
    expect(absolute.suggestedPct).toBeCloseTo(60);
  });

  it("floors cashBufferMin at 0 when over-capitalized range", () => {
    const result = calculate(1_000_000, [input(4, 15, 6, 8)]);
    expect(result.cashBufferMin).toBe(0);
  });

  it("sets isFullyDeployed when all cash is exactly allocated", () => {
    // 10 stocks at exactly 10% each (absolute) = 100% total
    const result = calculate(1_000_000, [
      input(4, 5, 10, 10),
      input(3, 5, 10, 10),
    ]);
    expect(result.isFullyDeployed).toBe(true);
    expect(result.cashBufferMin).toBe(0);
    expect(result.cashBufferMax).toBe(0);
  });

  it("marks isAbsolute true when min equals max", () => {
    const result = calculate(1_000_000, [input(4, 1, 8, 8)]);
    expect(result.buckets[0].isAbsolute).toBe(true);
  });

  it("marks hasRangeError true and excludes bucket from totals when min > max", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 8, 6), // invalid: min 8 > max 6
      input(3, 2, 4, 6), // valid
    ]);
    const errorBucket = result.buckets.find((b) => b.star === 4)!;
    const validBucket = result.buckets.find((b) => b.star === 3)!;

    expect(errorBucket.hasRangeError).toBe(true);
    expect(errorBucket.perStockMin).toBe(0);
    expect(errorBucket.perStockMax).toBe(0);
    expect(errorBucket.bucketMin).toBe(0);
    expect(errorBucket.bucketMax).toBe(0);
    expect(errorBucket.suggestedPct).toBeNull();
    expect(errorBucket.suggestedAmount).toBeNull();

    // Only the valid bucket contributes to totals
    expect(result.totalDeployedMin).toBeCloseTo(validBucket.bucketMin);
    expect(result.totalDeployedMax).toBeCloseTo(validBucket.bucketMax);
  });

  it("returns buckets ordered by star descending (4 first)", () => {
    const result = calculate(1_000_000, [
      input(1, 1, 0, 2),
      input(4, 1, 6, 8),
      input(3, 1, 4, 6),
    ]);
    expect(result.buckets.map((b) => b.star)).toEqual([4, 3, 1]);
  });

  it("returns empty buckets array when all counts are 0", () => {
    const result = calculate(1_000_000, [input(4, 0, 6, 8)]);
    expect(result.buckets).toHaveLength(0);
    expect(result.totalDeployedMin).toBe(0);
    expect(result.totalDeployedMax).toBe(0);
    expect(result.cashBufferMin).toBeCloseTo(1_000_000);
    expect(result.cashBufferMax).toBeCloseTo(1_000_000);
  });

  // ── Absolute range (min === max) scenarios ──────────────────────────────────

  it("absolute range: normal case (budget > sum of fixed targets) shows per-stock value and cash buffer", () => {
    // 2 stocks at 8% fixed → 16% deployed, 84% cash
    const result = calculate(1_000_000, [input(4, 2, 8, 8)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    const bucket = result.buckets[0];
    expect(bucket.isAbsolute).toBe(true);
    expect(bucket.perStockMin).toBeCloseTo(80_000);
    expect(bucket.perStockMax).toBeCloseTo(80_000);
    expect(bucket.bucketMin).toBeCloseTo(160_000);
    expect(bucket.bucketMax).toBeCloseTo(160_000);
    expect(result.cashBufferMin).toBeCloseTo(840_000);
    expect(result.cashBufferMax).toBeCloseTo(840_000);
    expect(bucket.suggestedPct).toBeNull();
    expect(bucket.suggestedAmount).toBeNull();
  });

  it("absolute range: isUnderCapitalized when fixed % × count exceeds 100%", () => {
    // 10 stocks at 15% fixed → 150% > 100% → under-cap
    const result = calculate(1_000_000, [input(4, 10, 15, 15)]);
    expect(result.isUnderCapitalized).toBe(true);
    expect(result.isBudgetConstrained).toBe(false);
    const bucket = result.buckets[0];
    expect(bucket.isAbsolute).toBe(true);
    expect(bucket.perStockMin).toBeCloseTo(150_000);
    expect(bucket.perStockMax).toBeCloseTo(150_000);
    expect(bucket.suggestedPct).toBeNull();
    expect(bucket.suggestedAmount).toBeNull();
  });

  it("absolute range: isBudgetConstrained is never set (min===max means sumMin===sumMax)", () => {
    // If min=max for every bucket, totalDeployedMin===totalDeployedMax.
    // The constrained check requires totalDeployedMax > budget, but then totalDeployedMin > budget too
    // → isUnderCapitalized fires first; never isBudgetConstrained alone.
    const result = calculate(1_000_000, [input(4, 8, 15, 15)]); // 120% → under-cap
    expect(result.isUnderCapitalized).toBe(true);
    expect(result.isBudgetConstrained).toBe(false);
  });

  it("absolute range: fully deployed when fixed targets sum to exactly 100%", () => {
    // 4 stocks at 25% each → 100%
    const result = calculate(1_000_000, [input(4, 4, 25, 25)]);
    expect(result.isFullyDeployed).toBe(true);
    expect(result.cashBufferMin).toBe(0);
    expect(result.cashBufferMax).toBe(0);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
  });

  it("absolute + range mix in constrained case: absolute bucket stays fixed, range bucket is interpolated", () => {
    // 1 stock at 60-60% (absolute) + 1 stock at 30-50% (range)
    // sumMin=90%, sumMax=110% → isBudgetConstrained, t=0.5
    // absolute: suggested = 60 + 0.5×0 = 60%
    // range:    suggested = 30 + 0.5×20 = 40%
    // total deployed = 60+40 = 100% ✓
    const result = calculate(1_000_000, [input(4, 1, 60, 60), input(3, 1, 30, 50)]);
    expect(result.isBudgetConstrained).toBe(true);
    const abs = result.buckets.find(b => b.star === 4)!;
    const rng = result.buckets.find(b => b.star === 3)!;
    expect(abs.isAbsolute).toBe(true);
    expect(abs.suggestedPct).toBeCloseTo(60);
    expect(abs.suggestedAmount).toBeCloseTo(600_000);
    expect(rng.suggestedPct).toBeCloseTo(40);
    expect(rng.suggestedAmount).toBeCloseTo(400_000);
    const total = abs.suggestedAmount! + rng.suggestedAmount!;
    expect(total).toBeCloseTo(1_000_000, 0);
  });

  // ── Way above max (large cash buffer) ──────────────────────────────────────

  it("large budget vs small stock count: normal case with large cash buffer", () => {
    // ₹10cr, 1×4★(6-8%) + 1×3★(4-6%) → max deployed 14%, cash 86%
    const result = calculate(100_000_000, [input(4, 1, 6, 8), input(3, 1, 4, 6)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    expect(result.totalDeployedMax).toBeCloseTo(14_000_000);
    expect(result.cashBufferMin).toBeCloseTo(86_000_000);
    expect(result.buckets).toHaveLength(2);
    const fourStar = result.buckets[0];
    expect(fourStar.perStockMax).toBeCloseTo(8_000_000); // 8% × 10cr
  });

  // ── Multi-rating normal case ────────────────────────────────────────────────

  it("normal case with all four ratings: correct per-bucket amounts and cash buffer", () => {
    // 2×4★(6-8%), 5×3★(4-6%), 3×2★(2-4%), 1×1★(0-2%) on ₹10L
    // totalDeployedMax = (2×8+5×6+3×4+1×2)% × 10L = 60%
    const result = calculate(1_000_000, [
      input(4, 2, 6, 8),
      input(3, 5, 4, 6),
      input(2, 3, 2, 4),
      input(1, 1, 0, 2),
    ]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    expect(result.totalDeployedMin).toBeCloseTo(380_000); // 38%
    expect(result.totalDeployedMax).toBeCloseTo(600_000); // 60%
    expect(result.cashBufferMin).toBeCloseTo(400_000);    // 40% cash at max deployment
    expect(result.buckets).toHaveLength(4);
    const fourStar = result.buckets.find(b => b.star === 4)!;
    const oneStar  = result.buckets.find(b => b.star === 1)!;
    expect(fourStar.perStockMax).toBeCloseTo(80_000);
    expect(fourStar.bucketMax).toBeCloseTo(160_000);
    expect(oneStar.perStockMax).toBeCloseTo(20_000);
    expect(oneStar.bucketMax).toBeCloseTo(20_000);
  });

  // ── Multi-bucket t-interpolation ───────────────────────────────────────────

  it("t-interpolation across multiple buckets: each gets the right suggested %", () => {
    // 10×4★(6-8%) + 5×3★(4-6%) on ₹10L
    // sumMin=80%, sumMax=110% → isBudgetConstrained
    // t = (100-80)/(110-80) = 2/3
    // 4★ suggestedPct = 6 + 2/3 × 2 = 22/3 ≈ 7.333%
    // 3★ suggestedPct = 4 + 2/3 × 2 = 16/3 ≈ 5.333%
    const result = calculate(1_000_000, [input(4, 10, 6, 8), input(3, 5, 4, 6)]);
    expect(result.isBudgetConstrained).toBe(true);
    const fourStar = result.buckets.find(b => b.star === 4)!;
    const threeStar = result.buckets.find(b => b.star === 3)!;
    expect(fourStar.suggestedPct).toBeCloseTo(22 / 3, 3);
    expect(threeStar.suggestedPct).toBeCloseTo(16 / 3, 3);
    const deployedTotal =
      fourStar.suggestedAmount! * fourStar.count +
      threeStar.suggestedAmount! * threeStar.count;
    expect(deployedTotal).toBeCloseTo(1_000_000, 0);
  });

  // ── Budget-constrained boundary cases ─────────────────────────────────────

  it("t=0 when budget equals sumMin exactly: suggested equals minimum for each bucket", () => {
    // 2×4★(50-60%): sumMin=100%=budget, sumMax=120% → isBudgetConstrained, t=0
    const result = calculate(1_000_000, [input(4, 2, 50, 60)]);
    expect(result.isBudgetConstrained).toBe(true);
    const bucket = result.buckets[0];
    expect(bucket.suggestedPct).toBeCloseTo(50); // min, since t=0
    expect(bucket.suggestedAmount).toBeCloseTo(500_000);
    const total = bucket.suggestedAmount! * bucket.count;
    expect(total).toBeCloseTo(1_000_000, 0);
  });

  it("t=1 when budget equals sumMax exactly: normal case (not constrained), cashBufferMin=0 but isFullyDeployed=false for range buckets", () => {
    // 12×4★(6-8%) + 1×3★(4-4%abs): max=12×8+4=100% → sumMax=budget → isNormal
    // cashBufferMin = budget - sumMax = 0
    // cashBufferMax = budget - sumMin = budget - (12×6+4)% = budget - 76% = 240k
    // isFullyDeployed = (cashBufferMin===0 && cashBufferMax===0) = false (cashBufferMax > 0)
    const result = calculate(1_000_000, [input(4, 12, 6, 8), input(3, 1, 4, 4)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    expect(result.cashBufferMin).toBeCloseTo(0);
    expect(result.cashBufferMax).toBeCloseTo(240_000);
    expect(result.isFullyDeployed).toBe(false);
  });

  it("1-star bucket at 0% min: contributes nothing to sumMin, only to sumMax", () => {
    // 5×1★(0-2%): sumMin=0, sumMax=10% → normal, large cash buffer
    const result = calculate(1_000_000, [input(1, 5, 0, 2)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    expect(result.totalDeployedMin).toBe(0);
    expect(result.totalDeployedMax).toBeCloseTo(100_000);
    expect(result.cashBufferMin).toBeCloseTo(900_000);
    expect(result.cashBufferMax).toBeCloseTo(1_000_000);
  });

  it("1-star at 0% min with many stocks: can still be budget-constrained via max", () => {
    // 60×1★(0-2%): sumMin=0 ≤ budget, sumMax=120% > budget → isBudgetConstrained
    // t = (100-0)/(120-0) = 5/6
    // suggestedPct = 0 + (5/6)×2 = 5/3 ≈ 1.667%
    const result = calculate(1_000_000, [input(1, 60, 0, 2)]);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(true);
    const bucket = result.buckets[0];
    expect(bucket.suggestedPct).toBeCloseTo(5 / 3, 3);
    const total = bucket.suggestedAmount! * bucket.count;
    expect(total).toBeCloseTo(1_000_000, 0);
  });

  // ── All buckets invalid ────────────────────────────────────────────────────

  it("all-error buckets: totals are zero, no flags set, full amount stays as cash", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 8, 6), // invalid
      input(3, 2, 6, 4), // invalid
    ]);
    expect(result.totalDeployedMin).toBe(0);
    expect(result.totalDeployedMax).toBe(0);
    expect(result.cashBufferMin).toBeCloseTo(1_000_000);
    expect(result.cashBufferMax).toBeCloseTo(1_000_000);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    result.buckets.forEach(b => {
      expect(b.hasRangeError).toBe(true);
      expect(b.suggestedPct).toBeNull();
      expect(b.suggestedAmount).toBeNull();
    });
  });

  // ── Mixed valid + invalid ──────────────────────────────────────────────────

  it("invalid bucket is excluded from totals; valid buckets still determine the state", () => {
    // 4★ invalid (min>max), 3★ valid (4-6%)
    // Only 3★ contributes: sumMin=2×4%=8%, sumMax=2×6%=12% → normal
    const result = calculate(1_000_000, [
      input(4, 2, 8, 6), // invalid
      input(3, 2, 4, 6), // valid: bucketMin=80k, bucketMax=120k
    ]);
    const validBucket = result.buckets.find(b => b.star === 3)!;
    expect(result.totalDeployedMin).toBeCloseTo(80_000);
    expect(result.totalDeployedMax).toBeCloseTo(120_000);
    expect(result.isUnderCapitalized).toBe(false);
    expect(result.isBudgetConstrained).toBe(false);
    expect(validBucket.suggestedPct).toBeNull(); // not constrained
  });
});
