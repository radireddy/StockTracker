import { describe, it, expect } from "vitest";
import { loadRefBySymbols } from "@/lib/import/corporate-actions-data";

function clientReturning(rows: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        in: () => ({
          // fetchAllRows calls .order().range()
          order: () => ({ range: () => Promise.resolve({ data: rows, error: null }) }),
        }),
      }),
    }),
  };
}

describe("loadRefBySymbols", () => {
  it("groups feed rows by symbol", async () => {
    const client = clientReturning([
      { symbol: "TDPOWERSYS", isin: "INE419M01019", action_type: "split", ex_date: "2026-08-24", factor: 2 },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = await loadRefBySymbols(client as any, ["TDPOWERSYS"]);
    expect(map.get("TDPOWERSYS")).toHaveLength(1);
    expect(map.get("TDPOWERSYS")![0].factor).toBe(2);
  });

  it("returns an empty map for no symbols", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await loadRefBySymbols({} as any, [])).size).toBe(0);
  });
});
