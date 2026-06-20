import { SupabaseClient } from "@supabase/supabase-js";
import { YahooFinanceProvider } from "@/lib/providers/stock-price/yahoo-finance-provider";

const provider = new YahooFinanceProvider();

export function isIndianTradingHours(): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);

  const day = ist.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) return false;

  const hour = ist.getHours();
  return hour >= 9 && hour < 16;
}

export async function refreshPrices(
  adminClient: SupabaseClient
): Promise<{ updated: number; failed: string[]; totalSymbols: number }> {
  // Get all companies joined with indian_stocks to get symbols
  const { data: companies, error } = await adminClient
    .from("companies")
    .select("isin, indian_stocks(isin, nse_symbol, bse_code)");

  if (error) throw new Error(`Failed to fetch companies: ${error.message}`);

  // Build symbol map: isin -> yahoo symbol (prefer NSE with .NS suffix)
  const symbolMap = new Map<string, string>(); // yahoo symbol -> isin
  for (const row of companies ?? []) {
    const stock = row.indian_stocks as unknown as { isin: string; nse_symbol: string | null; bse_code: string | null } | null;
    if (!stock) continue;
    if (stock.nse_symbol) {
      symbolMap.set(stock.nse_symbol, stock.isin);
    } else if (stock.bse_code) {
      symbolMap.set(stock.bse_code, stock.isin);
    }
  }

  const uniqueSymbols = Array.from(symbolMap.keys());
  if (uniqueSymbols.length === 0) {
    return { updated: 0, failed: [], totalSymbols: 0 };
  }

  const quotes = await provider.fetchBulkQuotes(uniqueSymbols);

  let updated = 0;
  const failed: string[] = [];

  for (const symbol of uniqueSymbols) {
    const quote = quotes.get(symbol);
    const isin = symbolMap.get(symbol)!;
    if (!quote) {
      failed.push(symbol);
      continue;
    }

    const { error: updateError } = await adminClient
      .from("indian_stocks")
      .update({
        price: quote.price,
        change: quote.change,
        change_pct: quote.changePct,
        volume: quote.volume ?? null,
        last_updated: new Date().toISOString(),
      })
      .eq("isin", isin);

    if (updateError) {
      console.error(`Failed to update indian_stocks for ${symbol} (${isin}):`, updateError);
      failed.push(symbol);
    } else {
      updated++;
    }
  }

  return { updated, failed, totalSymbols: uniqueSymbols.length };
}
