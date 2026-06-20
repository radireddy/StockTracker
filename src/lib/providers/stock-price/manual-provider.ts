import { StockPriceProvider, StockQuote } from "./types";

export class ManualPriceProvider implements StockPriceProvider {
  name = "manual";

  async fetchQuote(symbol: string): Promise<StockQuote> {
    throw new Error(
      "Manual provider does not fetch prices. Update prices manually."
    );
  }

  async fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
    return new Map();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
