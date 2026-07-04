import { describe, it, expect, vi, beforeEach } from "vitest";

const { quoteMock } = vi.hoisted(() => ({ quoteMock: vi.fn() }));

// Mock yahoo-finance2 so tests never hit the network.
vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quoteMock;
  },
}));

import { YahooFinanceProvider } from "@/lib/providers/stock-price/yahoo-finance-provider";
import { StockPriceError } from "@/lib/providers/stock-price/types";

describe("YahooFinanceProvider", () => {
  const provider = new YahooFinanceProvider();

  beforeEach(() => {
    quoteMock.mockReset();
  });

  it("has name 'yahoo-finance'", () => {
    expect(provider.name).toBe("yahoo-finance");
  });

  it("normalizes a successful quote into StockQuote", async () => {
    quoteMock.mockResolvedValue({
      symbol: "RELIANCE.NS",
      regularMarketPrice: 1234.567,
      regularMarketPreviousClose: 1200,
      regularMarketChange: 34.567,
      regularMarketChangePercent: 2.88,
      regularMarketVolume: 1000,
    });

    const quote = await provider.fetchQuote("RELIANCE");
    expect(quote.symbol).toBe("RELIANCE");
    expect(quote.price).toBe(1234.57);
    expect(quote.volume).toBe(1000);
  });

  it("wraps fetch failures in a provider-neutral StockPriceError", async () => {
    quoteMock.mockRejectedValue(new Error("network down"));

    const err = await provider.fetchQuote("RELIANCE").catch((e) => e);
    expect(err).toBeInstanceOf(StockPriceError);
    expect(err.provider).toBe("yahoo-finance");
    expect(err.symbol).toBe("RELIANCE");
    expect(err.timedOut).toBe(false);
    expect(err.message).toContain("network down");
  });

  it("flags timeouts via StockPriceError.timedOut", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    quoteMock.mockRejectedValue(timeout);

    const err = await provider.fetchQuote("RELIANCE").catch((e) => e);
    expect(err).toBeInstanceOf(StockPriceError);
    expect(err.timedOut).toBe(true);
  });

  it("throws StockPriceError when no quote is returned", async () => {
    quoteMock.mockResolvedValue(null);

    const err = await provider.fetchQuote("RELIANCE").catch((e) => e);
    expect(err).toBeInstanceOf(StockPriceError);
    expect(err.message).toContain("No quote returned");
  });
});
