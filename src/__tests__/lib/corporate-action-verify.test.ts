import { describe, it, expect } from "vitest";
import { verifyCandidate } from "@/lib/import/corporate-action-verify";
import type { CorporateActionCandidate } from "@/lib/import/corporate-action-detect";
import type { RefAction } from "@/lib/import/corporate-actions-data";

const base: CorporateActionCandidate = {
  stock_id: "s1", symbol: "TDPOWERSYS", isin: "INE419M01027", account_id: "a",
  action_type: "split", factor: 2, ex_date_window: { from: "2026-01-01", to: "2026-12-31" },
  observed: { buys: 100, sells: 200, fifoOpen: 0, holdings: 0 }, status: "inferred",
};

describe("verifyCandidate", () => {
  it("verifies when a feed row matches symbol + window + factor", () => {
    const ref = new Map<string, RefAction[]>([["TDPOWERSYS", [
      { symbol: "TDPOWERSYS", isin: "INE419M01019", action_type: "split", ex_date: "2026-08-24", factor: 2 },
    ]]]);
    expect(verifyCandidate(base, ref)).toEqual({ status: "verified", ex_date: "2026-08-24" });
  });

  it("stays inferred when no feed row matches", () => {
    expect(verifyCandidate(base, new Map()).status).toBe("inferred");
  });

  it("stays inferred when the factor disagrees", () => {
    const ref = new Map<string, RefAction[]>([["TDPOWERSYS", [
      { symbol: "TDPOWERSYS", isin: null, action_type: "split", ex_date: "2026-08-24", factor: 5 },
    ]]]);
    expect(verifyCandidate(base, ref).status).toBe("inferred");
  });
});
