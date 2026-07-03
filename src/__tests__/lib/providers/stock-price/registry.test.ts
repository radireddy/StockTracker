import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the providers to avoid importing yahoo-finance2
vi.mock("@/lib/providers/stock-price/manual-provider", () => ({
  ManualPriceProvider: class {
    name = "manual";
    async fetchQuote() { throw new Error("Manual"); }
    async fetchBulkQuotes() { return new Map(); }
    async isAvailable() { return true; }
  },
}));

vi.mock("@/lib/providers/stock-price/yahoo-finance-provider", () => ({
  YahooFinanceProvider: class {
    name = "yahoo-finance";
    async fetchQuote() { return { symbol: "TEST", price: 100, change: 0, changePct: 0, timestamp: new Date() }; }
    async fetchBulkQuotes() { return new Map(); }
    async isAvailable() { return true; }
  },
}));

describe("StockPriceProviderRegistry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("has manual and yahoo-finance providers registered", async () => {
    const { stockPriceRegistry } = await import("@/lib/providers/stock-price/registry");
    const providers = stockPriceRegistry.listProviders();
    expect(providers).toContain("manual");
    expect(providers).toContain("yahoo-finance");
  });

  it("defaults to yahoo-finance as active provider", async () => {
    const { stockPriceRegistry } = await import("@/lib/providers/stock-price/registry");
    const active = stockPriceRegistry.getActive();
    expect(active.name).toBe("yahoo-finance");
  });

  it("can set active provider", async () => {
    const { stockPriceRegistry } = await import("@/lib/providers/stock-price/registry");
    stockPriceRegistry.setActive("manual");
    expect(stockPriceRegistry.getActive().name).toBe("manual");
    // Reset
    stockPriceRegistry.setActive("yahoo-finance");
  });

  it("throws when setting unknown provider as active", async () => {
    const { stockPriceRegistry } = await import("@/lib/providers/stock-price/registry");
    expect(() => stockPriceRegistry.setActive("unknown")).toThrow('Provider "unknown" not registered');
  });

  it("getProvider returns provider by name", async () => {
    const { stockPriceRegistry } = await import("@/lib/providers/stock-price/registry");
    const manual = stockPriceRegistry.getProvider("manual");
    expect(manual).toBeDefined();
    expect(manual!.name).toBe("manual");
  });

  it("getProvider returns undefined for unknown name", async () => {
    const { stockPriceRegistry } = await import("@/lib/providers/stock-price/registry");
    expect(stockPriceRegistry.getProvider("nonexistent")).toBeUndefined();
  });
});
