import { describe, it, expect } from "vitest";
import { DEFAULT_ALLOCATION_RANGES } from "@/types/database";

describe("DEFAULT_ALLOCATION_RANGES", () => {
  it("has 5 star levels (0–4)", () => {
    expect(Object.keys(DEFAULT_ALLOCATION_RANGES)).toHaveLength(5);
  });

  it("has correct ranges for each star", () => {
    expect(DEFAULT_ALLOCATION_RANGES["1"]).toEqual({ min: 0, max: 2 });
    expect(DEFAULT_ALLOCATION_RANGES["2"]).toEqual({ min: 2, max: 4 });
    expect(DEFAULT_ALLOCATION_RANGES["3"]).toEqual({ min: 4, max: 6 });
    expect(DEFAULT_ALLOCATION_RANGES["4"]).toEqual({ min: 6, max: 8 });
  });

  it("ranges are contiguous and non-overlapping", () => {
    const keys = Object.keys(DEFAULT_ALLOCATION_RANGES).sort();
    for (let i = 1; i < keys.length; i++) {
      expect(DEFAULT_ALLOCATION_RANGES[keys[i]].min).toBe(
        DEFAULT_ALLOCATION_RANGES[keys[i - 1]].max
      );
    }
  });

  it("each range has min <= max (0★ is a degenerate {0,0} range)", () => {
    for (const range of Object.values(DEFAULT_ALLOCATION_RANGES)) {
      expect(range.min).toBeLessThanOrEqual(range.max);
    }
    // 0★ is specifically a collapsed band — any positive value reads as over-allocated
    expect(DEFAULT_ALLOCATION_RANGES["0"]).toEqual({ min: 0, max: 0 });
  });
});
