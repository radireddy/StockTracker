import { describe, it, expect } from "vitest";
import { hasResearchData, type ResearchCompany } from "@/lib/utils/research-data";

function bare(overrides: Partial<ResearchCompany> = {}): ResearchCompany {
  return {
    star_rating: null,
    strategy: null,
    buy_price: null,
    projection_models: [],
    ...overrides,
  };
}

describe("hasResearchData", () => {
  it("is false for an empty portfolio", () => {
    expect(hasResearchData([])).toBe(false);
  });

  it("is false when no company has any research field", () => {
    expect(hasResearchData([bare(), bare()])).toBe(false);
  });

  it("is false when a valuation model exists but every scenario figure is null", () => {
    const c = bare({
      projection_models: [
        { valuation_scenarios: [{ target_market_cap: null, irr: null, buy_price: null }] },
      ],
    });
    expect(hasResearchData([c])).toBe(false);
  });

  it("is true when any company has a star rating", () => {
    expect(hasResearchData([bare(), bare({ star_rating: 3 })])).toBe(true);
  });

  it("is true when any company has a strategy", () => {
    expect(hasResearchData([bare({ strategy: "core" })])).toBe(true);
  });

  it("is true when any company has a target buy price", () => {
    expect(hasResearchData([bare({ buy_price: 100 })])).toBe(true);
  });

  it("is true when any valuation scenario has a target market cap", () => {
    const c = bare({
      projection_models: [
        { valuation_scenarios: [{ target_market_cap: 5000, irr: null, buy_price: null }] },
      ],
    });
    expect(hasResearchData([c])).toBe(true);
  });

  it("is true when any valuation scenario has an irr", () => {
    const c = bare({
      projection_models: [{ valuation_scenarios: [{ target_market_cap: null, irr: 15, buy_price: null }] }],
    });
    expect(hasResearchData([c])).toBe(true);
  });

  it("is true when any valuation scenario has a buy price", () => {
    const c = bare({
      projection_models: [{ valuation_scenarios: [{ target_market_cap: null, irr: null, buy_price: 90 }] }],
    });
    expect(hasResearchData([c])).toBe(true);
  });
});
