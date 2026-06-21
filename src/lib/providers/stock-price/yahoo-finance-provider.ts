import YahooFinance from "yahoo-finance2";
import type { StockPriceProvider, StockQuote } from "./types";

const BATCH_SIZE = 8;

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export class YahooFinanceProvider implements StockPriceProvider {
  name = "yahoo-finance";

  private mapSymbol(symbol: string): string {
    const clean = symbol.includes(":") ? symbol.split(":")[1] : symbol;
    if (clean.endsWith(".NS") || clean.endsWith(".BO")) return clean;
    return `${clean}.NS`;
  }

  async fetchQuote(symbol: string): Promise<StockQuote> {
    const mapped = this.mapSymbol(symbol);
    const result = await yf.quote(mapped);

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
        const quotes = await yf.quote(mapped);
        const quotesArr = Array.isArray(quotes) ? quotes : [quotes];

        for (const q of quotesArr) {
          if (q && q.regularMarketPrice) {
            const mappedIdx = mapped.indexOf(q.symbol);
            const originalSymbol = mappedIdx >= 0 ? batch[mappedIdx] : q.symbol;
            results.set(originalSymbol, this.mapResult(originalSymbol, q));
          }
        }
      } catch (error) {
        console.warn(`Yahoo Finance: batch fetch failed, falling back to individual:`, error);
        for (const symbol of batch) {
          try {
            const quote = await this.fetchQuote(symbol);
            results.set(symbol, quote);
          } catch (e) {
            console.warn(`Yahoo Finance: failed to fetch ${symbol}:`, e);
          }
        }
      }

      if (batches.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

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
