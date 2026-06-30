import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { recomputeHoldings } from "@/lib/holdings";
import type {
  BrokerParseResult,
  ImportResult,
  ParsedTrade,
} from "./types";

const log = createLogger({ service: "import-engine" });

/**
 * Sort trades chronologically by execution_time, then trade_date as fallback.
 */
function sortTrades(trades: ParsedTrade[]): ParsedTrade[] {
  return [...trades].sort((a, b) => {
    if (a.trade_date !== b.trade_date)
      return a.trade_date.localeCompare(b.trade_date);
    return a.execution_time.localeCompare(b.execution_time);
  });
}

/**
 * Import Engine — processes each raw trade into the database individually.
 *
 * Key properties:
 * - No grouping: Each broker trade is saved as a separate transaction row
 * - Idempotent: Uses (owner_id, trade_id) unique constraint; re-importing skips existing trades
 * - Incremental: Can import partial tradebooks in any order
 * - Auto-creates companies: Stocks not yet in the portfolio get created automatically
 * - Holdings recomputation: After import, recalculates per-owner and aggregate holdings
 * - Owner-scoped: All trades are tagged to a specific portfolio owner; dedup is per-owner
 */
export async function executeImport(
  userId: string,
  portfolioId: string,
  ownerId: string,
  jobId: string,
  parseResult: BrokerParseResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSupabase: any
): Promise<ImportResult> {
  const broker = parseResult.metadata.broker;
  const adminClient = createAdminClient();
  const errors: Array<{ symbol?: string; message: string }> = [];
  const symbolsImported = new Set<string>();
  const symbolsFailed = new Set<string>();
  const symbolsSkipped = new Set<string>();
  const newCompaniesCreated: string[] = [];

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Add parse warnings
  for (const w of parseResult.errors) {
    if (w.severity === "error") {
      errors.push({ symbol: w.symbol, message: w.message });
    }
  }

  const sorted = sortTrades(parseResult.trades);

  // Batch: collect all unique ISINs and auto-create missing stocks
  const uniqueIsins = [...new Set(sorted.map((t) => t.isin))];
  const { data: stocks } = await adminClient
    .from("indian_stocks")
    .select("isin, name, nse_symbol")
    .in("isin", uniqueIsins);

  type StockInfo = { isin: string; name: string; nse_symbol: string | null };
  const stockMap = new Map<string, StockInfo>(
    (stocks ?? []).map((s: StockInfo) => [s.isin, s] as [string, StockInfo])
  );

  // Auto-create missing stocks from tradebook data
  const missingIsins = uniqueIsins.filter((isin) => !stockMap.has(isin));
  if (missingIsins.length > 0) {
    const created: string[] = [];
    const failed: string[] = [];

    for (const isin of missingIsins) {
      const trade = sorted.find((t) => t.isin === isin)!;
      const stockRow = {
        isin,
        name: trade.symbol,
        nse_symbol: trade.exchange === "NSE" ? trade.symbol : null,
        bse_code: trade.exchange === "BSE" ? trade.symbol : null,
        exchange: trade.exchange === "BSE" ? ("BSE" as const) : ("NSE" as const),
      };

      let { error: insertErr } = await adminClient
        .from("indian_stocks")
        .upsert(stockRow, { onConflict: "isin", ignoreDuplicates: true });

      if (insertErr) {
        log.warn("Stock insert failed, retrying without symbol columns", {
          isin,
          symbol: trade.symbol,
          error: insertErr.message,
        });
        const { error: retryErr } = await adminClient
          .from("indian_stocks")
          .upsert(
            { isin, name: trade.symbol, exchange: stockRow.exchange },
            { onConflict: "isin", ignoreDuplicates: true }
          );
        insertErr = retryErr;
      }

      if (insertErr) {
        log.error("Failed to auto-create stock", {
          isin,
          symbol: trade.symbol,
          error: insertErr.message,
        });
        errors.push({
          symbol: trade.symbol,
          message: `Could not register stock (ISIN: ${isin}): ${insertErr.message}`,
        });
        failed.push(trade.symbol);
      } else {
        stockMap.set(isin, { isin, name: trade.symbol, nse_symbol: stockRow.nse_symbol });
        created.push(trade.symbol);
      }
    }

    if (created.length > 0) {
      log.info("Auto-created missing stocks", {
        count: created.length,
        symbols: created,
      });
    }
    if (failed.length > 0) {
      log.warn("Failed to create some stocks", {
        count: failed.length,
        symbols: failed,
      });
    }
  }

  // Batch: collect all existing companies in this portfolio for these ISINs
  const { data: existingCompanies } = await userSupabase
    .from("companies")
    .select("id, isin")
    .eq("portfolio_id", portfolioId)
    .in("isin", uniqueIsins);

  const companyMap = new Map<string, string>(
    (existingCompanies ?? []).map((c: { id: string; isin: string }) => [
      c.isin,
      c.id,
    ] as [string, string])
  );

  // Batch: get existing trade_id values for this owner (idempotency check)
  const allTradeIds = sorted.map((t) => t.trade_id);
  const existingTradeIdSet = new Set<string>();

  for (let i = 0; i < allTradeIds.length; i += 500) {
    const batch = allTradeIds.slice(i, i + 500);
    const { data: byTradeId } = await userSupabase
      .from("transactions")
      .select("trade_id")
      .eq("owner_id", ownerId)
      .in("trade_id", batch);

    for (const t of byTradeId ?? []) {
      existingTradeIdSet.add(t.trade_id);
    }
  }

  let processedRows = 0;

  for (const trade of sorted) {
    try {
      const result = await processTrade(
        userId,
        portfolioId,
        ownerId,
        trade,
        broker,
        stockMap,
        companyMap,
        existingTradeIdSet,
        userSupabase,
        newCompaniesCreated
      );

      if (result === "imported") {
        importedCount++;
        symbolsImported.add(trade.symbol);
      } else {
        skippedCount++;
        symbolsSkipped.add(trade.symbol);
      }
    } catch (err) {
      failedCount++;
      symbolsFailed.add(trade.symbol);
      errors.push({
        symbol: trade.symbol,
        message: `${trade.trade_type.toUpperCase()} ${trade.quantity} @ ${trade.price} on ${trade.trade_date}: ${(err as Error).message}`,
      });
    }

    processedRows++;

    if (processedRows % 100 === 0 || processedRows === parseResult.trades.length) {
      await userSupabase
        .from("import_jobs")
        .update({
          processed_rows: processedRows,
          imported_count: importedCount,
          skipped_count: skippedCount,
          failed_count: failedCount,
        })
        .eq("id", jobId);
    }
  }

  // Recompute holdings for all affected companies (per-owner + aggregate)
  const isinToSymbol = new Map<string, string>();
  const affectedIsins = new Set<string>();
  for (const trade of sorted) {
    isinToSymbol.set(trade.isin, trade.symbol);
    if (symbolsImported.has(trade.symbol)) {
      affectedIsins.add(trade.isin);
    }
  }

  const symbolsIncompleteHistory: string[] = [];
  for (const isin of affectedIsins) {
    const cid = companyMap.get(isin);
    if (cid) {
      try {
        const incomplete = await recomputeHoldings(cid, userSupabase);
        if (incomplete) {
          symbolsIncompleteHistory.push(isinToSymbol.get(isin) ?? isin);
        }
      } catch (err) {
        log.error("Failed to recompute holdings", {
          isin,
          error: (err as Error).message,
        });
      }
    }
  }

  if (symbolsIncompleteHistory.length > 0) {
    errors.push({
      message: `${symbolsIncompleteHistory.length} stock(s) have more sells than buys — import older tradebooks to get correct holdings: ${symbolsIncompleteHistory.join(", ")}`,
    });
  }

  const result: ImportResult = {
    status:
      failedCount > 0 && importedCount === 0 ? "failed" : "completed",
    imported_count: importedCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    new_companies_created: newCompaniesCreated,
    symbols_imported: [...symbolsImported],
    symbols_skipped: [...symbolsSkipped],
    symbols_failed: [...symbolsFailed],
    symbols_incomplete_history: symbolsIncompleteHistory,
    errors,
  };

  // Final job update
  await userSupabase
    .from("import_jobs")
    .update({
      status: result.status,
      processed_rows: parseResult.trades.length,
      imported_count: result.imported_count,
      skipped_count: result.skipped_count,
      failed_count: result.failed_count,
      summary: {
        symbols_imported: result.symbols_imported,
        symbols_skipped: result.symbols_skipped,
        symbols_failed: result.symbols_failed,
        symbols_incomplete_history: result.symbols_incomplete_history,
        new_companies_created: result.new_companies_created,
        date_range: parseResult.metadata.date_range,
        client_id: parseResult.metadata.client_id,
      },
      errors: result.errors,
    })
    .eq("id", jobId);

  log.info("Import completed", {
    jobId,
    ownerId,
    imported: importedCount,
    skipped: skippedCount,
    failed: failedCount,
    raw_trades: parseResult.trades.length,
  });

  return result;
}

async function processTrade(
  userId: string,
  portfolioId: string,
  ownerId: string,
  trade: ParsedTrade,
  broker: string,
  stockMap: Map<string, { isin: string; name: string; nse_symbol: string | null }>,
  companyMap: Map<string, string>,
  existingTradeIdSet: Set<string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSupabase: any,
  newCompaniesCreated: string[]
): Promise<"imported" | "skipped"> {
  // Idempotency: check if trade_id already exists for this owner
  if (existingTradeIdSet.has(trade.trade_id)) return "skipped";

  if (!stockMap.has(trade.isin)) {
    throw new Error(
      `Stock not found for ISIN ${trade.isin} (${trade.symbol}). Auto-creation may have failed.`
    );
  }

  // Ensure company exists
  let companyId = companyMap.get(trade.isin);
  if (!companyId) {
    const { data: newCompany, error: createErr } = await userSupabase
      .from("companies")
      .insert({
        user_id: userId,
        portfolio_id: portfolioId,
        isin: trade.isin,
      })
      .select("id")
      .single();

    if (createErr) {
      if (createErr.code === "23505") {
        const { data: existing } = await userSupabase
          .from("companies")
          .select("id")
          .eq("portfolio_id", portfolioId)
          .eq("isin", trade.isin)
          .single();
        if (existing) {
          companyId = existing.id as string;
          companyMap.set(trade.isin, companyId);
        } else {
          throw new Error(`Failed to create company: ${createErr.message}`);
        }
      } else {
        throw new Error(`Failed to create company: ${createErr.message}`);
      }
    } else {
      companyId = newCompany.id as string;
      companyMap.set(trade.isin, companyId);
      newCompaniesCreated.push(trade.symbol);
    }
  }

  const { error: txnErr } = await userSupabase.from("transactions").insert({
    company_id: companyId,
    user_id: userId,
    owner_id: ownerId,
    type: trade.trade_type.toUpperCase(),
    quantity: trade.quantity,
    price: trade.price,
    fees: 0,
    traded_at: trade.execution_time || `${trade.trade_date}T00:00:00+05:30`,
    source: broker,
    trade_id: trade.trade_id,
    order_id: trade.order_id || null,
    exchange: trade.exchange,
  });

  if (txnErr) {
    if (txnErr.code === "23505" && txnErr.message.includes("trade_id")) {
      return "skipped";
    }
    throw new Error(`Failed to insert transaction: ${txnErr.message}`);
  }

  existingTradeIdSet.add(trade.trade_id);

  return "imported";
}
