import { describe, it, expect } from "vitest";
import { loadRefForSecurities } from "@/lib/import/corporate-actions-data";

// Mock returns rows for whichever column is queried (.in(col, vals)).
function clientReturning(bySymbol: unknown[], byIsin: unknown[]) {
  return {
    from: () => ({
      select: () => ({
        in: (col: string) => ({
          order: () => ({
            range: () =>
              Promise.resolve({ data: col === "symbol" ? bySymbol : byIsin, error: null }),
          }),
        }),
      }),
    }),
  };
}

describe("loadRefForSecurities", () => {
  it("groups feed rows matched by symbol", async () => {
    const client = clientReturning(
      [{ symbol: "TDPOWERSYS", isin: "INE419M01019", action_type: "split", ex_date: "2026-08-24", factor: "2" }],
      []
    );
     
    const map = await loadRefForSecurities(client as any, [{ symbol: "TDPOWERSYS", isin: "INE419M01027" }]);
    expect(map.get("TDPOWERSYS")).toHaveLength(1);
    expect(map.get("TDPOWERSYS")![0].factor).toBe(2);
  });

  it("finds an action by ISIN even when the symbol changed", async () => {
    // Feed lists the split under the OLD symbol; the account trades the NEW symbol,
    // but the ISIN is unchanged.
    const client = clientReturning(
      [],
      [{ symbol: "HBLPOWER", isin: "INE292B01021", action_type: "split", ex_date: "2025-06-01", factor: "2" }]
    );
     
    const map = await loadRefForSecurities(client as any, [{ symbol: "HBLENGINE", isin: "INE292B01021" }]);
    expect(map.get("HBLENGINE")).toHaveLength(1);
    expect(map.get("HBLENGINE")![0].action_type).toBe("split");
  });

  it("returns an empty map for no securities", async () => {
     
    expect((await loadRefForSecurities({} as any, [])).size).toBe(0);
  });
});
