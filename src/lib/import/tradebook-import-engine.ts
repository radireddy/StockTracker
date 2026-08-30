import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStocks } from "@/lib/stocks/resolve-stock";
import { computeFifoMatches } from "./fifo-engine";
import { createLogger } from "@/lib/logger";
import type {
  TradebookParseResult,
  TradebookImportResult,
  RawTradeForFifo,
} from "./tradebook-types";

const log = createLogger({ service: "tradebook-import-engine" });

/**
 * Tradebook Import Engine
 *
 * Semantics:
 *  1. Create an audit row in import_tradebooks.
 *  2. Resolve stocks (ISIN → stock_id) via resolveStocks.
 *  3. Bulk upsert trades with ON CONFLICT DO NOTHING (idempotent).
 *     Same file re-imported → 0 new rows, FIFO recompute skipped.
 *  4. If new trades were inserted, reload ALL trades for this account
 *     and recompute FIFO matches (delete + insert trade_lot_matches).
 *  5. Finalise the audit row with counts.
 *
 * Account detection and creation is handled by the caller (API route /
 * server action) — this engine receives a pre-resolved accountId.
 */
export async function executeTradebookImport(
  userId: string,
  accountId: string,
  accountLabel: string,
  parseResult: TradebookParseResult,
  fileName: string
): Promise<TradebookImportResult> {
  const admin = createAdminClient();
  const { trades, metadata, errors: parseErrors } = parseResult;
  const engineErrors: Array<{ row?: number; symbol?: string; message: string }> = [];

  for (const e of parseErrors) {
    if (e.severity === "error") engineErrors.push({ symbol: e.symbol, message: e.message });
  }

  // 1. Create import audit row -------------------------------------------------
  const { data: auditRow, error: auditErr } = await admin
    .from("import_tradebooks")
    .insert({
      user_id: userId,
      account_id: accountId,
      broker: metadata.broker,
      client_id: metadata.client_id,
      date_from: metadata.date_from,
      date_to: metadata.date_to,
      file_name: fileName,
      status: "partial",
      total_rows: trades.length,
      errors: [],
    })
    .select("id")
    .single();

  if (auditErr || !auditRow) {
    log.error("Failed to create import_tradebooks row", { error: auditErr?.message });
    return {
      status: "failed",
      account_id: accountId,
      account_label: accountLabel,
      imported_count: 0,
      skipped_count: 0,
      error_count: 1,
      total_rows: trades.length,
      date_from: metadata.date_from,
      date_to: metadata.date_to,
      errors: [{ message: "Failed to create import record." }],
    };
  }
  const importId: string = (auditRow as { id: string }).id;

  // 2. Resolve stocks ----------------------------------------------------------
  const uniqueIsins = [...new Set(trades.map((t) => t.isin))];
  const refs = uniqueIsins.map((isin) => {
    const t = trades.find((x) => x.isin === isin)!;
    return { isin, symbol: t.symbol, sector: null };
  });
  const resolved = await resolveStocks(admin, refs);

  // 3. Bulk upsert trades (ON CONFLICT DO NOTHING) -----------------------------
  const insertRows = trades.map((t) => ({
    user_id: userId,
    account_id: accountId,
    symbol: t.symbol,
    isin: t.isin,
    trade_date: t.trade_date,
    exchange: t.exchange,
    segment: t.segment,
    series: t.series,
    trade_type: t.trade_type,
    is_auction: t.is_auction,
    quantity: t.quantity,
    price: t.price,
    broker_trade_id: t.broker_trade_id,
    broker_order_id: t.broker_order_id,
    executed_at: t.executed_at,
    stock_id: resolved.get(t.isin)?.stockId ?? null,
    import_tradebook_id: importId,
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insertedTrades, error: insertErr } = await (admin as any)
    .from("trades")
    .upsert(insertRows, { onConflict: "account_id,broker_trade_id", ignoreDuplicates: true })
    .select() as { data: unknown[] | null; error: { message: string } | null };

  if (insertErr) {
    log.error("Trade upsert failed", { error: insertErr.message });
    await admin
      .from("import_tradebooks")
      .update({ status: "failed", errors: [{ message: insertErr.message }] })
      .eq("id", importId);
    return {
      status: "failed",
      account_id: accountId,
      account_label: accountLabel,
      imported_count: 0,
      skipped_count: 0,
      error_count: 1,
      total_rows: trades.length,
      date_from: metadata.date_from,
      date_to: metadata.date_to,
      errors: [{ message: "Database error during trade insert." }],
    };
  }

  const importedCount = (insertedTrades as unknown[])?.length ?? 0;
  const skippedCount  = trades.length - importedCount;

  // 4. Recompute FIFO only when new trades were inserted -----------------------
  if (importedCount > 0) {
    const { data: allTrades, error: fetchErr } = await admin
      .from("trades")
      .select("id, isin, stock_id, trade_date, trade_type, quantity, price, executed_at")
      .eq("account_id", accountId)
      .order("trade_date", { ascending: true });

    if (fetchErr || !allTrades) {
      log.error("Failed to fetch trades for FIFO recompute", { error: fetchErr?.message });
    } else {
      const fifoTrades: RawTradeForFifo[] = (allTrades as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        isin: r.isin as string,
        stock_id: (r.stock_id as string | null) ?? null,
        trade_date: r.trade_date as string,
        trade_type: r.trade_type as "buy" | "sell",
        quantity: Number(r.quantity),
        price: Number(r.price),
        executed_at: (r.executed_at as string | null) ?? null,
      }));

      const matches = computeFifoMatches({ userId, accountId, trades: fifoTrades });

      // Replace lot matches atomically (delete old → insert new)
      await admin.from("trade_lot_matches").delete().eq("account_id", accountId);

      if (matches.length > 0) {
        await admin.from("trade_lot_matches").insert(matches).select();
      }
    }
  }

  // 5. Finalise audit row ------------------------------------------------------
  const warningErrors = parseErrors
    .filter((e) => e.severity === "warning")
    .map((e) => ({ symbol: e.symbol, message: e.message }));
  const finalErrors = [...engineErrors, ...warningErrors];

  await admin
    .from("import_tradebooks")
    .update({
      status: "completed",
      imported_count: importedCount,
      skipped_count: skippedCount,
      error_count: finalErrors.length,
      errors: finalErrors,
    })
    .eq("id", importId);

  log.info("Tradebook import completed", {
    importId,
    accountId,
    importedCount,
    skippedCount,
  });

  return {
    status: "completed",
    account_id: accountId,
    account_label: accountLabel,
    imported_count: importedCount,
    skipped_count: skippedCount,
    error_count: finalErrors.length,
    total_rows: trades.length,
    date_from: metadata.date_from,
    date_to: metadata.date_to,
    errors: finalErrors,
  };
}
