import YahooFinance from "yahoo-finance2";
import type { StockPriceProvider, StockQuote } from "./types";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "stock-price", provider: "yahoo-finance" });

const BATCH_SIZE = 8;
const REQUEST_TIMEOUT_MS = 5000;

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

// Abort the underlying fetch if Yahoo doesn't respond in time so hung
// requests don't tie up the serverless function until the platform kills it.
function quoteFetchOptions() {
  return { fetchOptions: { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) } };
}

export class YahooFinanceProvider implements StockPriceProvider {
  name = "yahoo-finance";

  private mapSymbol(symbol: string): string {
    const clean = symbol.includes(":") ? symbol.split(":")[1] : symbol;
    if (clean.endsWith(".NS") || clean.endsWith(".BO")) return clean;
    return `${clean}.NS`;
  }

  async fetchQuote(symbol: string): Promise<StockQuote> {
    const mapped = this.mapSymbol(symbol);

    let result;
    try {
      result = await yf.quote(mapped, undefined, quoteFetchOptions());
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      log.warn("Quote fetch failed", {
        symbol,
        mapped,
        timedOut,
        timeoutMs: REQUEST_TIMEOUT_MS,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!result || !result.regularMarketPrice) {
      throw new Error(`No quote returned for ${symbol}`);
    }

    return this.mapResult(symbol, result);
  }

  async fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>> {
    const results = new Map<string, StockQuote>();
    const batches: string[][] = [];

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      batches.push(symbols.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      const mapped = batch.map((s) => this.mapSymbol(s));

      try {
        const quotes = await yf.quote(mapped, undefined, quoteFetchOptions());
        const quotesArr = Array.isArray(quotes) ? quotes : [quotes];

        for (const q of quotesArr) {
          if (q && q.regularMarketPrice) {
            const mappedIdx = mapped.indexOf(q.symbol);
            const originalSymbol = mappedIdx >= 0 ? batch[mappedIdx] : q.symbol;
            results.set(originalSymbol, this.mapResult(originalSymbol, q));
          }
        }
      } catch (error) {
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        log.warn("Batch fetch failed, falling back to individual", { batchSize: batch.length, timedOut, timeoutMs: REQUEST_TIMEOUT_MS, error: error instanceof Error ? error.message : String(error) });
        for (const symbol of batch) {
          try {
            const quote = await this.fetchQuote(symbol);
            results.set(symbol, quote);
          } catch (e) {
            log.warn("Individual fetch failed", { symbol, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      if (batches.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    log.info("Bulk quotes fetched", { requested: symbols.length, received: results.size });

    return results;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapResult(originalSymbol: string, q: any): StockQuote {
    const price = q.regularMarketPrice ?? 0;
    const prevClose = q.regularMarketPreviousClose ?? 0;
    const change = q.regularMarketChange ?? (prevClose ? price - prevClose : 0);
    const changePct = q.regularMarketChangePercent ?? (prevClose ? (change / prevClose) * 100 : 0);

    return {
      symbol: originalSymbol,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePct: Math.round(changePct * 100) / 100,
      volume: q.regularMarketVolume ?? undefined,
      marketCap: q.marketCap ?? undefined,
      timestamp: new Date(),
    };
  }
}
