import type { StockPriceProvider, StockQuote } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "stock-price", provider: "twelve-data" });

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const BATCH_SIZE = 8; // Twelve Data free tier: 8 symbols per request

export class TwelveDataProvider implements StockPriceProvider {
  name = "twelve-data";

  private get apiKey(): string {
    return process.env.TWELVE_DATA_API_KEY ?? "";
  }

  private cleanSymbol(symbol: string): string {
    // Strip exchange prefix if present (e.g. "NSE:SAMHI" → "SAMHI")
    return symbol.includes(":") ? symbol.split(":")[1] : symbol;
  }

  async fetchQuote(symbol: string): Promise<StockQuote> {
    const quotes = await this.fetchBulkQuotes([symbol]);
    const quote = quotes.get(symbol);
    if (!quote) throw new Error(`No quote returned for ${symbol}`);
    return quote;
  }

  async fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
    const results = new Map<string, StockQuote>();
    const batches: string[][] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      batches.push(symbols.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      const cleanSymbols = batch.map((s) => this.cleanSymbol(s));
      const url = `${TWELVE_DATA_BASE_URL}/quote?symbol=${cleanSymbols.join(",")}&exchange=NSE&apikey=${this.apiKey}`;

      const response = await fetch(url);
      if (!response.ok) {
        log.error("API request failed", { status: response.status, statusText: response.statusText, batchSize: batch.length });
        continue;
      }

      const data = await response.json();

      if (batch.length === 1) {
        // Single symbol: API returns a single object
        const quote = this.parseQuote(batch[0], data);
        if (quote) results.set(batch[0], quote);
      } else {
        // Multiple symbols: API returns keyed object { "SYMBOL": {...}, ... }
        for (let i = 0; i < batch.length; i++) {
          const cleanSym = cleanSymbols[i];
          const originalSym = batch[i];
          const entry = data[cleanSym];
          if (entry) {
            const quote = this.parseQuote(originalSym, entry);
            if (quote) results.set(originalSym, quote);
          }
        }
      }

      // Rate limit: small delay between batches
      if (batches.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    log.info("Bulk quotes fetched", { requested: symbols.length, received: results.size });

    return results;
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.TWELVE_DATA_API_KEY;
  }

  private parseQuote(originalSymbol: string, data: Record<string, unknown>): StockQuote | null {
    if (data.status === "error" || !data.close) {
      log.warn("No data for symbol", { symbol: originalSymbol });
      return null;
    }

    return {
      symbol: originalSymbol,
      price: parseFloat(data.close as string),
      change: parseFloat((data.change as string) ?? "0"),
      changePct: parseFloat((data.percent_change as string) ?? "0"),
      volume: data.volume ? parseInt(data.volume as string, 10) : undefined,
      timestamp: new Date(),
    };
  }
}
