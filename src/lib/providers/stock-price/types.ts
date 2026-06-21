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
