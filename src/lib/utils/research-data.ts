/**
 * Research fields that indicate a user has moved beyond plain holdings
 * tracking into conviction / valuation analysis. Structural subset of the
 * dashboard's company row, so callers can pass their rows directly.
 */
export type ResearchCompany = {
  star_rating: number | null;
  strategy: string | null;
  buy_price: number | null;
  projection_models: {
    valuation_scenarios: {
      target_market_cap: number | null;
      irr: number | null;
      buy_price: number | null;
    }[];
  }[];
};

/**
 * True when ANY company in the portfolio carries ANY research data:
 * a conviction star, a strategy (core/satellite), a target buy price, or a
 * valuation scenario with a non-null figure. Drives progressive disclosure of
 * the dashboard's research columns, filters, and allocation views.
 */
export function hasResearchData(companies: ResearchCompany[]): boolean {
  return companies.some(
    (c) =>
      c.star_rating != null ||
      c.strategy != null ||
      c.buy_price != null ||
      c.projection_models.some((pm) =>
        pm.valuation_scenarios.some(
          (s) => s.target_market_cap != null || s.irr != null || s.buy_price != null
        )
      )
  );
}
