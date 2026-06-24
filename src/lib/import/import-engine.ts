import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import type {
  BrokerParseResult,
  GroupedTrade,
  ImportResult,
  ParsedTrade,
} from "./types";

const log = createLogger({ service: "import-engine" });

/**
 * Groups trades by symbol + date + price + type for efficient insertion.
 * Trades at the same price on the same day for the same stock
 * are combined into a single transaction.
 */
export function groupTrades(trades: ParsedTrade[]): GroupedTrade[] {
  const groups = new Map<string, ParsedTrade[]>();

  for (const t of trades) {
    const key = `${t.isin}|${t.trade_date}|${t.price}|${t.trade_type}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(t);
    } else {
      groups.set(key, [t]);
    }
  }

  const result: GroupedTrade[] = [];
  for (const [, groupTrades] of groups) {
    const first = groupTrades[0];
    const totalQuantity = groupTrades.reduce((sum, t) => sum + t.quantity, 0);
    const totalValue = groupTrades.reduce(
      (sum, t) => sum + t.quantity * t.price,
      0
    );

    result.push({
      symbol: first.symbol,
      isin: first.isin,
      trade_date: first.trade_date,
      exchange: first.exchange,
      trade_type: first.trade_type.toUpperCase() as "BUY" | "SELL",
      total_quantity: totalQuantity,
      avg_price: Math.round((totalValue / totalQuantity) * 100) / 100,
      trade_ids: groupTrades.map((t) => t.trade_id),
      order_ids: [...new Set(groupTrades.map((t) => t.order_id))],
      earliest_execution_time: groupTrades.reduce(
        (min, t) => (t.execution_time < min ? t.execution_time : min),
        groupTrades[0].execution_time
      ),
    });
  }

  // Sort chronologically
  result.sort((a, b) => {
    if (a.trade_date !== b.trade_date)
      return a.trade_date.localeCompare(b.trade_date);
    return a.earliest_execution_time.localeCompare(b.earliest_execution_time);
  });

  return result;
}

/**
 * Import Engine — processes grouped trades into the database.
 *
 * Key properties:
 * - Idempotent: Uses trade_id unique constraint; re-importing skips existing trades
 * - Incremental: Can import partial tradebooks in any order
 * - Auto-creates companies: Stocks not yet in the portfolio get created automatically
 * - Holdings recomputation: After import, recalculates quantity/avg_price/buy_date
 */
export async function executeImport(
  userId: string,
  portfolioId: string,
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

  const grouped = groupTrades(parseResult.trades);
  let processedRows = 0;

  // Batch: collect all unique ISINs and auto-create missing stocks
  const uniqueIsins = [...new Set(grouped.map((g) => g.isin))];
  const { data: stocks } = await adminClient
    .from("indian_stocks")
    .select("isin, name, nse_symbol")
    .in("isin", uniqueIsins);

  type StockInfo = { isin: string; name: string; nse_symbol: string | null };
  const stockMap = new Map<string, StockInfo>(
    (stocks ?? []).map((s: StockInfo) => [s.isin, s] as [string, StockInfo])
  );

  // Auto-create missing stocks from tradebook data (one at a time to isolate failures)
  const missingIsins = uniqueIsins.filter((isin) => !stockMap.has(isin));
  if (missingIsins.length > 0) {
    const created: string[] = [];
    const failed: string[] = [];

    for (const isin of missingIsins) {
      const trade = grouped.find((g) => g.isin === isin)!;
      const stockRow = {
        isin,
        name: trade.symbol,
        nse_symbol: trade.exchange === "NSE" ? trade.symbol : null,
        bse_code: trade.exchange === "BSE" ? trade.symbol : null,
        exchange: trade.exchange === "BSE" ? ("BSE" as const) : ("NSE" as const),
      };

      // Try insert first; on conflict (e.g. nse_symbol already taken), try without nse_symbol
      let { error: insertErr } = await adminClient
        .from("indian_stocks")
        .upsert(stockRow, { onConflict: "isin", ignoreDuplicates: true });

      if (insertErr) {
        // Retry without nse_symbol/bse_code in case of unique constraint conflict
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

  // Batch: get all existing trade_ids for idempotency check
  // Check both the trade_id column and the trade_ids JSONB array
  const allTradeIds = grouped.flatMap((g) => g.trade_ids);
  const existingTradeIdSet = new Set<string>();

  // Query in batches of 500 to avoid query size limits
  for (let i = 0; i < allTradeIds.length; i += 500) {
    const batch = allTradeIds.slice(i, i + 500);
    // Check trade_id column (primary key of grouped transaction)
    const { data: byTradeId } = await userSupabase
      .from("transactions")
      .select("trade_id, trade_ids")
      .in("trade_id", batch);

    for (const t of byTradeId ?? []) {
      existingTradeIdSet.add(t.trade_id);
      // Also add all trade_ids from the JSONB array
      if (Array.isArray(t.trade_ids)) {
        for (const id of t.trade_ids) existingTradeIdSet.add(id);
      }
    }
  }

  for (const group of grouped) {
    try {
      const result = await processGroup(
        userId,
        portfolioId,
        group,
        broker,
        stockMap,
        companyMap,
        existingTradeIdSet,
        userSupabase,
        newCompaniesCreated
      );

      if (result === "imported") {
        importedCount++;
        symbolsImported.add(group.symbol);
      } else {
        skippedCount++;
        symbolsSkipped.add(group.symbol);
      }
    } catch (err) {
      failedCount++;
      symbolsFailed.add(group.symbol);
      errors.push({
        symbol: group.symbol,
        message: `${group.trade_type} ${group.total_quantity} @ ${group.avg_price} on ${group.trade_date}: ${(err as Error).message}`,
      });
    }

    processedRows += group.trade_ids.length;

    // Update progress periodically
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

  // Recompute holdings for all affected companies
  // Build isin→symbol map for reporting
  const isinToSymbol = new Map<string, string>();
  const affectedIsins = new Set<string>();
  for (const group of grouped) {
    isinToSymbol.set(group.isin, group.symbol);
    if (symbolsImported.has(group.symbol)) {
      affectedIsins.add(group.isin);
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
    imported: importedCount,
    skipped: skippedCount,
    failed: failedCount,
    groups: grouped.length,
    raw_trades: parseResult.trades.length,
  });

  return result;
}

async function processGroup(
  userId: string,
  portfolioId: string,
  group: GroupedTrade,
  broker: string,
  stockMap: Map<string, { isin: string; name: string; nse_symbol: string | null }>,
  companyMap: Map<string, string>,
  existingTradeIdSet: Set<string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSupabase: any,
  newCompaniesCreated: string[]
): Promise<"imported" | "skipped"> {
  // Idempotency: check if all trade_ids already exist
  const newTradeIds = group.trade_ids.filter(
    (id) => !existingTradeIdSet.has(id)
  );
  if (newTradeIds.length === 0) return "skipped";

  // Verify stock exists (should always pass since we auto-create missing stocks above)
  if (!stockMap.has(group.isin)) {
    throw new Error(
      `Stock not found for ISIN ${group.isin} (${group.symbol}). Auto-creation may have failed.`
    );
  }

  // Ensure company exists
  let companyId = companyMap.get(group.isin);
  if (!companyId) {
    const { data: newCompany, error: createErr } = await userSupabase
      .from("companies")
      .insert({
        user_id: userId,
        portfolio_id: portfolioId,
        isin: group.isin,
      })
      .select("id")
      .single();

    if (createErr) {
      // Could be a race condition — try fetching again
      if (createErr.code === "23505") {
        const { data: existing } = await userSupabase
          .from("companies")
          .select("id")
          .eq("portfolio_id", portfolioId)
          .eq("isin", group.isin)
          .single();
        if (existing) {
          companyId = existing.id as string;
          companyMap.set(group.isin, companyId);
        } else {
          throw new Error(`Failed to create company: ${createErr.message}`);
        }
      } else {
        throw new Error(`Failed to create company: ${createErr.message}`);
      }
    } else {
      companyId = newCompany.id as string;
      companyMap.set(group.isin, companyId);
      newCompaniesCreated.push(group.symbol);
    }
  }

  // Calculate new quantity (proportional to new trade IDs only)
  const newQuantity =
    newTradeIds.length === group.trade_ids.length
      ? group.total_quantity
      : Math.round(
          (group.total_quantity * newTradeIds.length) / group.trade_ids.length
        );

  // Insert the grouped transaction with all trade_ids stored in JSONB
  const { error: txnErr } = await userSupabase.from("transactions").insert({
    company_id: companyId,
    user_id: userId,
    type: group.trade_type,
    quantity: newQuantity,
    price: group.avg_price,
    fees: 0,
    date: group.trade_date,
    source: broker,
    trade_id: newTradeIds[0],
    trade_ids: newTradeIds,
    order_id: group.order_ids[0] || null,
    exchange: group.exchange,
    notes:
      newTradeIds.length > 1
        ? `Grouped ${newTradeIds.length} executions`
        : null,
  });

  if (txnErr) {
    if (txnErr.code === "23505" && txnErr.message.includes("trade_id")) {
      return "skipped";
    }
    throw new Error(`Failed to insert transaction: ${txnErr.message}`);
  }

  // Track all trade_ids for idempotency within this run
  for (const id of newTradeIds) {
    existingTradeIdSet.add(id);
  }

  return "imported";
}

/** Returns true if the company has incomplete history (more sells than buys). */
async function recomputeHoldings(
  companyId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("type, quantity, price, date")
    .eq("company_id", companyId)
    .order("date")
    .order("created_at");

  if (error) throw new Error(error.message);

  if (!transactions || transactions.length === 0) {
    await supabase
      .from("companies")
      .update({ quantity: null, avg_buy_price: null, buy_date: null })
      .eq("id", companyId);
    return false;
  }

  let hasBuys = false;
  let hasSells = false;

  // FIFO method (Indian stock market rule):
  // Sells consume the oldest buy lots first.
  // Average price = total remaining cost / total remaining quantity.
  const lots: { qty: number; price: number }[] = [];

  for (const txn of transactions) {
    if (txn.type === "BUY") {
      lots.push({ qty: txn.quantity, price: txn.price });
      hasBuys = true;
    } else if (txn.type === "SELL") {
      let remaining = txn.quantity;
      while (remaining > 0 && lots.length > 0) {
        if (lots[0].qty <= remaining) {
          remaining -= lots[0].qty;
          lots.shift();
        } else {
          lots[0].qty -= remaining;
          remaining = 0;
        }
      }
      hasSells = true;
    }
  }

  const totalQty = lots.reduce((s, l) => s + l.qty, 0);
  const totalCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const incompleteHistory = totalQty < 0 || (hasSells && !hasBuys);

  const avgPrice =
    totalQty > 0
      ? Math.round((totalCost / totalQty) * 100) / 100
      : null;
  const earliestBuy = lots.length > 0 ? transactions.find(
    (t: { type: string }) => t.type === "BUY"
  ) : null;

  await supabase
    .from("companies")
    .update({
      // 0 = fully sold (has transactions but no remaining shares)
      // null = no transactions yet (manually added)
      quantity: totalQty > 0 ? totalQty : 0,
      avg_buy_price: avgPrice,
      buy_date: earliestBuy?.date ?? null,
    })
    .eq("id", companyId);

  return incompleteHistory;
}
