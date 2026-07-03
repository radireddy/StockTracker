import { StockPriceError, StockPriceProvider, StockQuote } from "./types";

export class ManualPriceProvider implements StockPriceProvider {
  name = "manual";

  async fetchQuote(symbol: string): Promise<StockQuote> {
    throw new StockPriceError(
      "Manual provider does not fetch prices. Update prices manually.",
      { provider: this.name, symbol }
    );
  }

  async fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
    return new Map();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
