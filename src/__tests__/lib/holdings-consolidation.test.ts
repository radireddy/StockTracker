import { describe, it, expect } from "vitest";
import {
  consolidateHoldings,
  type DashboardCompany,
  type DashboardHolding,
} from "@/hooks/use-dashboard-data";

function company(id: string, overrides: Partial<DashboardCompany> = {}): DashboardCompany {
  return {
    id,
    isin: `INE${id}`,
    star_rating: null,
    strategy: null,
    buy_price: null,
    investment_horizon_years: null,
    indian_stocks: null,
    projection_models: [],
    ...overrides,
  };
}

function holding(
  company_id: string,
  account_id: string,
  quantity: number,
  avg_buy_price: number | null
): DashboardHolding {
  return { company_id, account_id, quantity, avg_buy_price };
}

describe("consolidateHoldings — accountFilter 'all'", () => {
  it("sums quantities across accounts and cost-weights the average price", () => {
    const companies = [company("a")];
    const holdings = [
      holding("a", "acc-1", 10, 100),
      holding("a", "acc-2", 30, 200),
    ];
    const [row] = consolidateHoldings(companies, holdings, "all");
    expect(row.quantity).toBe(40);
    // (10*100 + 30*200) / 40 = 7000/40 = 175
    expect(row.avg_buy_price).toBe(175);
  });

  it("shows research-only companies with a null position", () => {
    const companies = [company("a"), company("b")];
    const holdings = [holding("a", "acc-1", 5, 100)];
    const rows = consolidateHoldings(companies, holdings, "all");
    const b = rows.find((r) => r.id === "b")!;
    expect(rows).toHaveLength(2);
    expect(b.quantity).toBeNull();
    expect(b.avg_buy_price).toBeNull();
  });

  it("treats a null avg_buy_price as zero cost in the weighting", () => {
    const companies = [company("a")];
    const holdings = [
      holding("a", "acc-1", 10, null),
      holding("a", "acc-2", 10, 200),
    ];
    const [row] = consolidateHoldings(companies, holdings, "all");
    expect(row.quantity).toBe(20);
    // (10*0 + 10*200) / 20 = 100
    expect(row.avg_buy_price).toBe(100);
  });
});

describe("consolidateHoldings — filtered by a single account", () => {
  it("only includes companies held in that account", () => {
    const companies = [company("a"), company("b")];
    const holdings = [
      holding("a", "acc-1", 10, 100),
      holding("b", "acc-2", 5, 50),
    ];
    const rows = consolidateHoldings(companies, holdings, "acc-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("a");
    expect(rows[0].quantity).toBe(10);
    expect(rows[0].avg_buy_price).toBe(100);
  });

  it("excludes companies with no position in the selected account", () => {
    const companies = [company("a")];
    const holdings = [holding("a", "acc-2", 10, 100)];
    const rows = consolidateHoldings(companies, holdings, "acc-1");
    expect(rows).toHaveLength(0);
  });

  it("sums multiple lots within the same account", () => {
    const companies = [company("a")];
    const holdings = [
      holding("a", "acc-1", 10, 100),
      holding("a", "acc-1", 10, 300),
    ];
    const rows = consolidateHoldings(companies, holdings, "acc-1");
    expect(rows[0].quantity).toBe(20);
    expect(rows[0].avg_buy_price).toBe(200);
  });
});
