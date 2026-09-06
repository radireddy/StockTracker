import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStocks } from "@/lib/stocks/resolve-stock";
import { computeFifoMatches } from "./fifo-engine";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { loadCorporateActionContext, loadRefForSecurities } from "./corporate-actions-data";
import { detectCorporateActions, type SecurityTrades } from "./corporate-action-detect";
import { reconcileWithFeed, feedActionsToApply } from "./corporate-action-verify";
import { securityKey } from "./corporate-actions";
import { detectOrphanPairs } from "./merger-detect";
import {
  deriveRemainingLots,
  aggregateOpenPositions,
  type TradeForOpenPositions,
  type StockQuote,
} from "./open-positions";
import { createLogger } from "@/lib/logger";
import type {
  TradebookParseResult,
  TradebookImportResult,
  RawTradeForFifo,
  AppliedCorporateAction,
  PendingCorporateAction,
  OrphanPairSuggestion,
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
type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Recompute FIFO lot matches for one account from its COMPLETE trade history
 * and atomically replace trade_lot_matches (delete → insert). Pages past the
 * PostgREST 1000-row cap.
 *
 * Exposed so batch imports can insert every file's trades first and recompute
 * ONCE per affected account, instead of once per file.
 */
export async function recomputeFifoForAccount(
  admin: AdminClient,
  userId: string,
  accountId: string
): Promise<void> {
  let allTrades: Record<string, unknown>[] | null = null;
  try {
    // Order by the primary key so pages are stable (FIFO re-sorts by time).
    allTrades = await fetchAllRows<Record<string, unknown>>((from, to) =>
      admin
        .from("trades")
        .select(
          "id, user_id, account_id, symbol, isin, stock_id, trade_date, trade_type, quantity, price, executed_at, broker_trade_id"
        )
        .eq("account_id", accountId)
        .eq("excluded", false)
        .order("id", { ascending: true })
        .range(from, to)
    );
  } catch (e) {
    log.error("Failed to fetch trades for FIFO recompute", {
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  // Corporate-action context (canonical identity + split/bonus factors).
  const ca = await loadCorporateActionContext(admin);

  const fifoTrades: RawTradeForFifo[] = allTrades.map((r) => ({
    id: r.id as string,
    isin: r.isin as string,
    stock_id: (r.stock_id as string | null) ?? null,
    trade_date: r.trade_date as string,
    trade_type: r.trade_type as "buy" | "sell",
    quantity: Number(r.quantity),
    price: Number(r.price),
    executed_at: (r.executed_at as string | null) ?? null,
  }));

  const matches = computeFifoMatches({ userId, accountId, trades: fifoTrades, ca });

  // Replace lot matches atomically (delete old → insert new)
  await admin.from("trade_lot_matches").delete().eq("account_id", accountId);
  if (matches.length > 0) {
    await admin.from("trade_lot_matches").insert(matches).select();
  }

  await rebuildOpenPositionSnapshot(admin, userId, accountId, allTrades, ca);
}

/** Recompute the account's open-position snapshot (current units, adjusted cost). */
async function rebuildOpenPositionSnapshot(
  admin: AdminClient,
  userId: string,
  accountId: string,
  rows: Record<string, unknown>[],
  ca: Awaited<ReturnType<typeof loadCorporateActionContext>>
): Promise<void> {
  const openTrades: TradeForOpenPositions[] = rows.map((r) => ({
    id: r.id as string,
    user_id: (r.user_id as string) ?? userId,
    account_id: (r.account_id as string) ?? accountId,
    symbol: (r.symbol as string) ?? "",
    isin: r.isin as string,
    stock_id: (r.stock_id as string | null) ?? null,
    trade_date: r.trade_date as string,
    trade_type: r.trade_type as "buy" | "sell",
    quantity: Number(r.quantity),
    price: Number(r.price),
    executed_at: (r.executed_at as string | null) ?? null,
    broker_trade_id: (r.broker_trade_id as string) ?? "",
  }));

  const lots = deriveRemainingLots(openTrades, ca);

  try {
    // Symbol/name lookup for canonical securities (price not needed here).
    const stockIds = [...new Set(lots.map((l) => l.stock_id).filter((v): v is string => v != null))];
    const quotes = new Map<string, StockQuote>();
    if (stockIds.length > 0) {
      const { data } = await admin
        .from("indian_stocks")
        .select("id, name, sector, nse_symbol, price")
        .in("id", stockIds);
      for (const s of (data ?? []) as Array<Record<string, unknown>>) {
        quotes.set(s.id as string, {
          name: (s.name as string | null) ?? null,
          sector: (s.sector as string | null) ?? null,
          nse_symbol: (s.nse_symbol as string | null) ?? null,
          price: s.price == null ? null : Number(s.price),
        });
      }
    }

    const positions = aggregateOpenPositions(lots, quotes);

    await admin.from("open_position_snapshots").delete().eq("account_id", accountId);
    if (positions.length > 0) {
      await admin.from("open_position_snapshots").insert(
        positions.map((p) => ({
          user_id: userId,
          account_id: accountId,
          stock_id: p.stock_id,
          isin: p.isin,
          symbol: p.symbol,
          quantity: p.quantity,
          avg_buy_price: p.avg_buy_price,
        }))
      );
    }
  } catch (e) {
    // Snapshot table may not exist yet (006 not applied) — don't fail the import.
    log.warn("open_position_snapshots unavailable; skipped snapshot refresh", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Detect corporate actions for an account's trade history, auto-apply verified
 * ones (writes to `corporate_actions` and recomputes FIFO), and return pending
 * (inferred/unexplained) candidates for user review.
 *
 * Safe to call after a FIFO recompute. Never throws — returns empty arrays on
 * any failure so it never breaks the import flow.
 */
export async function detectAndApplyForAccount(
  admin: AdminClient,
  userId: string,
  accountId: string
): Promise<{ applied: AppliedCorporateAction[]; pending: PendingCorporateAction[]; mergerSuggestions: OrphanPairSuggestion[] }> {
  try {
    // Load all trades for this account (pages past PostgREST 1000-row cap).
    const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      admin
        .from("trades")
        .select(
          "id, user_id, account_id, symbol, isin, stock_id, trade_date, trade_type, quantity, price, executed_at, broker_trade_id"
        )
        .eq("account_id", accountId)
        .eq("excluded", false)
        .order("id", { ascending: true })
        .range(from, to)
    );

    // Corporate-action context (existing known actions + canonical identity).
    const ca = await loadCorporateActionContext(admin);

    // Group trades by symbol; also attach current holdings qty per symbol.
    const bySymbol = new Map<string, SecurityTrades>();
    for (const r of rows) {
      const sym = String(r.symbol ?? "");
      const g = bySymbol.get(sym) ?? {
        symbol: sym,
        stock_id: (r.stock_id as string | null) ?? null,
        isin: String(r.isin ?? ""),
        account_id: accountId,
        trades: [],
        holdingsQty: null,
      };
      g.trades.push({
        id: r.id as string,
        user_id: r.user_id as string,
        account_id: accountId,
        symbol: sym,
        isin: String(r.isin ?? ""),
        stock_id: (r.stock_id as string | null) ?? null,
        trade_date: r.trade_date as string,
        trade_type: r.trade_type as "buy" | "sell",
        quantity: Number(r.quantity),
        price: Number(r.price),
        executed_at: (r.executed_at as string | null) ?? null,
        broker_trade_id: (r.broker_trade_id as string) ?? "",
      });
      bySymbol.set(sym, g);
    }

    // Attach holdings qty (broker statement) per symbol so Signal B can fire.
    const { data: hRows } = await admin
      .from("holdings")
      .select("isin, quantity")
      .eq("account_id", accountId);
    const holdByIsin = new Map<string, number>();
    for (const h of (hRows ?? []) as Array<{ isin: string; quantity: number | string }>) {
      holdByIsin.set(h.isin, (holdByIsin.get(h.isin) ?? 0) + Number(h.quantity));
    }
    for (const g of bySymbol.values()) {
      const q = [...new Set(g.trades.map((t) => t.isin))].reduce(
        (s, i) => s + (holdByIsin.get(i) ?? 0),
        0
      );
      g.holdingsQty = q > 0 ? q : holdByIsin.size > 0 ? 0 : null;
    }

    const securities = [...bySymbol.values()];
    const refBySymbol = await loadRefForSecurities(
      admin,
      securities.map((s) => ({ symbol: s.symbol, isin: s.isin }))
    );

    const applied: AppliedCorporateAction[] = [];
    const pending: PendingCorporateAction[] = [];
    let didApply = false;

    // Pass 1 — proactively apply feed-confirmed actions for HELD positions, even
    // with no mismatch. A buy-and-hold through a split produces no oversell and
    // (for tradebook-only users) no holdings gap, so the mismatch detector never
    // fires — yet the split still changes quantity/cost. Apply the authoritative
    // feed fact directly, then reflect it in `ca` so detection sees adjusted units.
    const today = new Date().toISOString().slice(0, 10);
    for (const sec of securities) {
      const toApply = feedActionsToApply(sec, refBySymbol.get(sec.symbol) ?? [], ca, today);
      for (const act of toApply) {
        await admin.from("corporate_actions").upsert(
          {
            stock_id: act.stock_id,
            action_type: act.action_type,
            ex_date: act.ex_date,
            factor: act.factor,
            source: "nse",
          },
          { onConflict: "stock_id,action_type,ex_date" }
        );
        applied.push({
          symbol: sec.symbol,
          action_type: act.action_type,
          factor: act.factor,
          ex_date: act.ex_date,
          source: "nse",
        });
        const key = securityKey(sec.stock_id, sec.isin, ca.canonicalMap);
        const list = ca.actionsBySecurity.get(key) ?? [];
        list.push(act);
        ca.actionsBySecurity.set(key, list);
        didApply = true;
      }
    }

    // Pass 2 — detect remaining mismatches (with Pass-1 actions reflected), then
    // verify feed-first: the reference feed supplies the authoritative factor +
    // ex_date, and we auto-apply only when applying it reconciles the mismatch.
    const candidates = detectCorporateActions(securities, ca);

    for (const c of candidates) {
      const sec = bySymbol.get(c.symbol);
      const v = sec
        ? reconcileWithFeed(c, sec, refBySymbol.get(c.symbol) ?? [], ca)
        : ({ status: c.status, actions: [] } as const);

      if (v.status === "verified" && v.actions.length > 0 && c.stock_id) {
        // Link ISIN-change fork: point superseded stock_ids at the canonical one.
        if (c.matched_stock_ids && c.matched_stock_ids.length > 1) {
          for (const old of c.matched_stock_ids) {
            if (old !== c.stock_id) {
              await admin
                .from("indian_stocks")
                .update({ canonical_stock_id: c.stock_id })
                .eq("id", old);
            }
          }
        }
        // Persist the feed-verified action(s) (source = 'nse').
        for (const act of v.actions) {
          await admin
            .from("corporate_actions")
            .upsert(
              {
                stock_id: act.stock_id,
                action_type: act.action_type,
                ex_date: act.ex_date,
                factor: act.factor,
                source: "nse",
              },
              { onConflict: "stock_id,action_type,ex_date" }
            );
          applied.push({
            symbol: c.symbol,
            action_type: act.action_type,
            factor: act.factor,
            ex_date: act.ex_date,
            source: "nse",
          });
        }
        didApply = true;
      } else {
        // "verified" can only reach here if stock_id was missing → treat as inferred.
        let status = v.status === "verified" ? "inferred" : v.status;
        // Don't offer one-click Apply for a guessed split the feed has NO record
        // of — applying it would fabricate a corporate action and corrupt cost
        // basis. Downgrade to manual review unless the feed has some action for
        // this security (even if it didn't reconcile).
        const hasFeedSupport = (refBySymbol.get(c.symbol) ?? []).length > 0;
        if (status === "inferred" && !hasFeedSupport) status = "unexplained";
        pending.push({ ...c, status });
      }
    }

    // Re-run FIFO now that the new action is recorded.
    if (didApply) {
      await recomputeFifoForAccount(admin, userId, accountId);
    }

    const mergerSuggestions = detectOrphanPairs(securities, ca);
    return { applied, pending, mergerSuggestions };
  } catch (e) {
    log.warn("detectAndApplyForAccount failed; skipping CA detection", {
      accountId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { applied: [], pending: [], mergerSuggestions: [] };
  }
}

export async function executeTradebookImport(
  userId: string,
  accountId: string,
  accountLabel: string,
  parseResult: TradebookParseResult,
  fileName: string,
  options: { recompute?: boolean } = {}
): Promise<TradebookImportResult> {
  const { recompute = true } = options;
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

  // 4. Recompute FIFO when new trades were inserted (unless deferred to a batch)
  if (importedCount > 0 && recompute) {
    await recomputeFifoForAccount(admin, userId, accountId);
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
