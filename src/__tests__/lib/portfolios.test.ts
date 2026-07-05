import { describe, it, expect } from "vitest";
import { firstOfType, initials } from "@/lib/utils/portfolios";
import type { Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

function makePortfolio(overrides: Partial<PortfolioWithCount> = {}): PortfolioWithCount {
  return {
    id: "p1",
    user_id: "u1",
    name: "My Portfolio",
    type: "holdings",
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    company_count: 0,
    ...overrides,
  } as PortfolioWithCount;
}

describe("firstOfType", () => {
  it("prefers the default portfolio of the requested type", () => {
    const list = [
      makePortfolio({ id: "a", type: "holdings", is_default: false }),
      makePortfolio({ id: "b", type: "holdings", is_default: true }),
      makePortfolio({ id: "c", type: "watchlist", is_default: true }),
    ];
    expect(firstOfType(list, "holdings")?.id).toBe("b");
  });

  it("falls back to the first of the type when none is default", () => {
    const list = [
      makePortfolio({ id: "a", type: "watchlist" }),
      makePortfolio({ id: "b", type: "holdings" }),
      makePortfolio({ id: "c", type: "holdings" }),
    ];
    expect(firstOfType(list, "holdings")?.id).toBe("b");
  });

  it("returns null when no portfolio of the type exists", () => {
    const list = [makePortfolio({ id: "a", type: "watchlist" })];
    expect(firstOfType(list, "holdings")).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(firstOfType([], "holdings")).toBeNull();
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Reliance Industries")).toBe("RI");
  });

  it("uses the first two letters of a single word", () => {
    expect(initials("Infosys")).toBe("IN");
  });

  it("strips non-letters before deriving initials", () => {
    expect(initials("Tata Motors (DVR)")).toBe("TM");
    expect(initials("3M India")).toBe("MI");
  });

  it("returns '?' when there are no letters", () => {
    expect(initials("123 456")).toBe("?");
    expect(initials("")).toBe("?");
  });
});
