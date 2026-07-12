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
});
