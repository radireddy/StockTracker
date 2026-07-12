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

  it("sets isOverAllocated when totalDeployedMax exceeds totalAmount", () => {
    // 15 four-star stocks at 8% max = 120% of portfolio
    const result = calculate(1_000_000, [input(4, 15, 6, 8)]);
    expect(result.isOverAllocated).toBe(true);
  });

  it("does not set isOverAllocated when targets fit within total", () => {
    const result = calculate(1_000_000, [input(4, 2, 6, 8)]);
    expect(result.isOverAllocated).toBe(false);
  });

  it("floors cashBufferMin at 0 when over-allocated", () => {
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
