import { describe, it, expect } from "vitest";
import { ManualPriceProvider } from "@/lib/providers/stock-price/manual-provider";
import { StockPriceError } from "@/lib/providers/stock-price/types";

describe("ManualPriceProvider", () => {
  const provider = new ManualPriceProvider();

  it("has name 'manual'", () => {
    expect(provider.name).toBe("manual");
  });

  it("fetchQuote throws a provider-neutral StockPriceError", async () => {
    const err = await provider.fetchQuote("RELIANCE").catch((e) => e);
    expect(err).toBeInstanceOf(StockPriceError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain("Manual provider does not fetch prices");
    expect(err.provider).toBe("manual");
    expect(err.symbol).toBe("RELIANCE");
    expect(err.timedOut).toBe(false);
  });

  it("fetchBulkQuotes returns empty map", async () => {
    const result = await provider.fetchBulkQuotes(["RELIANCE", "INFY"]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("isAvailable returns true", async () => {
    expect(await provider.isAvailable()).toBe(true);
  });
});
