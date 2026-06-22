"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIndianTradingHours } from "@/lib/services/price-refresh";
import { YahooFinanceProvider } from "@/lib/providers/stock-price/yahoo-finance-provider";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "price-actions" });

const provider = new YahooFinanceProvider();

export async function manualRefreshPrices() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const start = Date.now();

  // Get symbols from user's companies joined with indian_stocks (RLS scoped)
  const { data: companies, error } = await supabase
    .from("companies")
    .select("isin, indian_stocks(isin, nse_symbol, bse_code)");

  if (error) throw new Error(error.message);

  // Build symbol map: yahoo symbol -> isin (prefer NSE symbol)
  const symbolMap = new Map<string, string>();
  for (const row of companies ?? []) {
    const stock = row.indian_stocks as unknown as { isin: string; nse_symbol: string | null; bse_code: string | null } | null;
    if (!stock) continue;
    if (stock.nse_symbol) {
      symbolMap.set(stock.nse_symbol, stock.isin);
    } else if (stock.bse_code) {
      symbolMap.set(stock.bse_code, stock.isin);
    }
  }

  const symbols = Array.from(symbolMap.keys());

  if (symbols.length === 0) {
    return { updated: 0, failed: [], totalSymbols: 0, outsideTradingHours: !isIndianTradingHours() };
  }

  const quotes = await provider.fetchBulkQuotes(symbols);

  // Use admin client to write to indian_stocks (user may not have write access)
  const adminClient = createAdminClient();
  let updated = 0;
  const failed: string[] = [];

  for (const symbol of symbols) {
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
      log.error("Failed to update stock price", { symbol, isin, error: updateError.message });
      failed.push(symbol);
    } else {
      updated++;
    }
  }

  revalidatePath("/");

  log.info("Manual price refresh completed", { updated, failed, totalSymbols: symbols.length, duration_ms: Date.now() - start });

  return {
    updated,
    failed,
    totalSymbols: symbols.length,
    outsideTradingHours: !isIndianTradingHours(),
  };
}
