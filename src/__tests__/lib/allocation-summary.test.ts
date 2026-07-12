import { describe, it, expect } from "vitest";
import { computeStarGroups, countUnrated } from "@/lib/utils/allocation-summary";
import type { CompanyForAllocation } from "@/lib/utils/allocation-summary";
import { DEFAULT_ALLOCATION_RANGES } from "@/types/database";

function makeCompany(overrides: {
  star_rating?: number | null;
  quantity?: number | null;
  price?: number | null;
} = {}): CompanyForAllocation {
  return {
    star_rating: overrides.star_rating !== undefined ? overrides.star_rating : 4,
    quantity: overrides.quantity !== undefined ? overrides.quantity : 10,
    indian_stocks: { price: overrides.price !== undefined ? overrides.price : 100 },
  };
}

describe("computeStarGroups", () => {
  it("returns null when no company has a price+quantity", () => {
    const companies = [
      makeCompany({ quantity: null }),
      makeCompany({ price: null }),
    ];
    expect(computeStarGroups(companies, null)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(computeStarGroups([], null)).toBeNull();
  });

  it("computes 100% weight for a single company", () => {
    const groups = computeStarGroups([makeCompany({ star_rating: 4 })], null);
    expect(groups).not.toBeNull();
    const fourStar = groups!.find((g) => g.star === 4)!;
    expect(fourStar.pct).toBeCloseTo(100);
    expect(fourStar.count).toBe(1);
  });

  it("splits weight proportionally between two star buckets", () => {
    const companies = [
      makeCompany({ star_rating: 4, quantity: 10, price: 100 }), // value 1000
      makeCompany({ star_rating: 3, quantity: 10, price: 100 }), // value 1000
    ];
    const groups = computeStarGroups(companies, null)!;
    expect(groups.find((g) => g.star === 4)!.pct).toBeCloseTo(50);
    expect(groups.find((g) => g.star === 3)!.pct).toBeCloseTo(50);
  });

  it("treats null star_rating as 0★ bucket", () => {
    const companies = [makeCompany({ star_rating: null })];
    const groups = computeStarGroups(companies, null)!;
    expect(groups.find((g) => g.star === 0)!.pct).toBeCloseTo(100);
  });

  it("scales group target band by company count", () => {
    // Two 4★ companies → groupMin = 6*2=12, groupMax = 8*2=16
    const companies = [
      makeCompany({ star_rating: 4 }),
      makeCompany({ star_rating: 4 }),
    ];
    const groups = computeStarGroups(companies, DEFAULT_ALLOCATION_RANGES)!;
    const fourStar = groups.find((g) => g.star === 4)!;
    expect(fourStar.groupMin).toBe(12);
    expect(fourStar.groupMax).toBe(16);
  });

  it("marks 100% allocation as over when only one 4★ stock (target max 8%)", () => {
    const groups = computeStarGroups(
      [makeCompany({ star_rating: 4 })],
      DEFAULT_ALLOCATION_RANGES
    )!;
    expect(groups.find((g) => g.star === 4)!.status).toBe("over");
  });

  it("marks status in_range when pct sits within the band", () => {
    // Two 4★ companies each 50% → pct=50, band=[6,8] scaled for 2 = [12,16] → over
    // Use a case where we have a 4★ at 7% to be in the 6-8% band
    // One 4★ (7% of portfolio) + one 1★ (93%) with default ranges
    const companies = [
      makeCompany({ star_rating: 4, quantity: 7, price: 100 }),   // 700
      makeCompany({ star_rating: 1, quantity: 93, price: 100 }),  // 9300
    ];
    const groups = computeStarGroups(companies, DEFAULT_ALLOCATION_RANGES)!;
    expect(groups.find((g) => g.star === 4)!.status).toBe("in_range");
  });

  it("marks status under when pct is below the band minimum", () => {
    // One 4★ at 1% of portfolio — target band [6,8]% → under
    const companies = [
      makeCompany({ star_rating: 4, quantity: 1, price: 100 }),   // 100
      makeCompany({ star_rating: 1, quantity: 99, price: 100 }),  // 9900
    ];
    const groups = computeStarGroups(companies, DEFAULT_ALLOCATION_RANGES)!;
    expect(groups.find((g) => g.star === 4)!.status).toBe("under");
  });

  it("returns groups ordered [4,3,2,1,0]", () => {
    const groups = computeStarGroups([makeCompany()], null)!;
    expect(groups.map((g) => g.star)).toEqual([4, 3, 2, 1, 0]);
  });

  it("ignores companies with zero quantity when counting", () => {
    const companies = [
      makeCompany({ star_rating: 4, quantity: 10 }),
      makeCompany({ star_rating: 4, quantity: 0 }),
    ];
    const groups = computeStarGroups(companies, null)!;
    expect(groups.find((g) => g.star === 4)!.count).toBe(1);
  });
});

describe("countUnrated", () => {
  it("counts companies with null star_rating and positive quantity", () => {
    const companies = [
      makeCompany({ star_rating: null, quantity: 5 }),
      makeCompany({ star_rating: null, quantity: 10 }),
      makeCompany({ star_rating: 4, quantity: 5 }),
    ];
    expect(countUnrated(companies)).toBe(2);
  });

  it("excludes unrated companies with null quantity", () => {
    const companies = [makeCompany({ star_rating: null, quantity: null })];
    expect(countUnrated(companies)).toBe(0);
  });

  it("returns 0 when all companies are rated", () => {
    expect(countUnrated([makeCompany({ star_rating: 3 })])).toBe(0);
  });
});
