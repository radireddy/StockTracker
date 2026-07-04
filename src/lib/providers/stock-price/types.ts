export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  marketCap?: number;
  timestamp: Date;
}

export interface StockPriceProvider {
  name: string;
  fetchQuote(symbol: string): Promise<StockQuote>;
  fetchBulkQuotes(symbols: string[]): Promise<Map<string, StockQuote>>;
  isAvailable(): Promise<boolean>;
}

/**
 * Provider-neutral error thrown by every StockPriceProvider so callers can
 * handle failures uniformly without knowing which provider is active or which
 * concrete error type it throws (e.g. Yahoo's TimeoutError).
 */
export class StockPriceError extends Error {
  readonly provider: string;
  readonly symbol?: string;
  readonly timedOut: boolean;

  constructor(
    message: string,
    opts: { provider: string; symbol?: string; timedOut?: boolean; cause?: unknown }
  ) {
    super(message, { cause: opts.cause });
    this.name = "StockPriceError";
    this.provider = opts.provider;
    this.symbol = opts.symbol;
    this.timedOut = opts.timedOut ?? false;
  }
}
