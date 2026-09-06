import { describe, it, expect } from "vitest";
import {
  resolveCanonical,
  cumulativeFactor,
  adjustQtyPrice,
  type CorporateAction,
} from "@/lib/import/corporate-actions";

const split5: CorporateAction = {
  stock_id: "S",
  action_type: "split",
  ex_date: "2025-06-01",
  factor: 5,
};

describe("resolveCanonical", () => {
  it("maps a superseded stock_id to its canonical id", () => {
    const map = new Map([["old", "new"]]);
    expect(resolveCanonical("old", map)).toBe("new");
  });

  it("returns the id unchanged when it is already canonical", () => {
    expect(resolveCanonical("new", new Map([["old", "new"]]))).toBe("new");
  });

  it("passes null through", () => {
    expect(resolveCanonical(null, new Map())).toBeNull();
  });
});

describe("cumulativeFactor — actions AFTER the trade apply", () => {
  it("applies a split whose ex_date is after the trade", () => {
    expect(cumulativeFactor("2025-01-01", [split5])).toBe(5);
  });

  it("does NOT apply a split whose ex_date is on/before the trade", () => {
    expect(cumulativeFactor("2025-06-01", [split5])).toBe(1);
    expect(cumulativeFactor("2025-09-01", [split5])).toBe(1);
  });

  it("multiplies factors of multiple actions after the trade", () => {
    const bonus2: CorporateAction = { stock_id: "S", action_type: "bonus", ex_date: "2025-08-01", factor: 2 };
    expect(cumulativeFactor("2025-01-01", [split5, bonus2])).toBe(10);
  });
});

describe("adjustQtyPrice — normalize a pre-action trade to current units", () => {
  it("multiplies quantity and divides price by the cumulative factor", () => {
    const { qty, price } = adjustQtyPrice(100, 1000, "2025-01-01", [split5]);
    expect(qty).toBe(500);
    expect(price).toBe(200);
  });

  it("preserves cost (qty*price) across the adjustment", () => {
    const before = 100 * 1000;
    const { qty, price } = adjustQtyPrice(100, 1000, "2025-01-01", [split5]);
    expect(qty * price).toBeCloseTo(before, 6);
  });

  it("leaves a post-action trade unchanged", () => {
    const { qty, price } = adjustQtyPrice(500, 200, "2025-09-01", [split5]);
    expect(qty).toBe(500);
    expect(price).toBe(200);
  });
});
