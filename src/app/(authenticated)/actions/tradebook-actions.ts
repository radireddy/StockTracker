"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectTradebookBroker } from "@/lib/import/tradebook-broker-registry";
import {
  executeTradebookImport,
  recomputeFifoForAccount,
  detectAndApplyForAccount,
} from "@/lib/import/tradebook-import-engine";
import { clientIdFromFileName } from "@/lib/import/tradebook-filename";
import { action, AppError, type ActionResult } from "@/lib/action-result";
import { createLogger } from "@/lib/logger";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  detectCorporateActions,
  type SecurityTrades,
} from "@/lib/import/corporate-action-detect";
import { loadCorporateActionContext } from "@/lib/import/corporate-actions-data";
import type { TradeForOpenPositions } from "@/lib/import/open-positions";
import type {
  TradebookImportResult,
  BatchImportResult,
  BatchFileResult,
  TradebookAdapter,
  TradebookParseResult,
  AppliedCorporateAction,
  PendingCorporateAction,
  OrphanPairSuggestion,
} from "@/lib/import/tradebook-types";

const log = createLogger({ service: "tradebook-actions" });
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_BATCH_FILES = 20;

type AuthCtx = Awaited<ReturnType<typeof getAuthUser>>;

/** Resolve (or create) the account a parsed tradebook belongs to, by client_id. */
async function resolveAccountForImport(
  user: AuthCtx["user"],
  supabase: AuthCtx["supabase"],
  adapter: TradebookAdapter,
  parseResult: TradebookParseResult,
  clientId: string | null
): Promise<{ accountId: string; accountLabel: string }> {
  const broker = adapter.broker;
  if (!clientId) {
    throw new AppError(
      "Could not read a Client ID from the tradebook.",
      "Pick the account in the import dialog, or use a file named like 'tradebook-<ClientID>-EQ.csv'."
    );
  }

  const { data: existing } = await supabase
    .from("accounts")
    .select("id, label, client_id")
    .eq("broker", broker)
    .eq("client_id", clientId)
    .maybeSingle();

  if (existing) {
    return { accountId: existing.id, accountLabel: existing.label };
  }

  const label = parseResult.metadata.account_label ?? `${clientId} (${adapter.displayName})`;
  const { data: created, error: cErr } = await supabase
    .from("accounts")
    .insert({ user_id: user.id, label, broker, client_id: clientId })
    .select("id, label")
    .single();
  if (cErr || !created) {
    throw new AppError(`Failed to create account: ${cErr?.message ?? "unknown error"}`);
  }
  return { accountId: created.id, accountLabel: created.label };
}

/** Use a user-chosen account (RLS verifies ownership) instead of auto-detecting. */
async function resolveChosenAccount(
  supabase: AuthCtx["supabase"],
  accountId: string
): Promise<{ accountId: string; accountLabel: string }> {
  const { data } = await supabase
    .from("accounts")
    .select("id, label")
    .eq("id", accountId)
    .maybeSingle();
  if (!data) throw new AppError("You don't have access to that account.");
  return { accountId: data.id, accountLabel: data.label };
}

/**
 * Parse one file, resolve its account, and insert its trades. FIFO recompute is
 * controlled by `recompute` — the batch path defers it so it can recompute once
 * per account after all files are inserted. Throws AppError on any file problem.
 */
async function importOneFile(
  user: AuthCtx["user"],
  supabase: AuthCtx["supabase"],
  file: File,
  opts: { recompute: boolean; accountId?: string }
): Promise<TradebookImportResult> {
  if (file.size > MAX_FILE_SIZE) throw new AppError("File exceeds 10 MB limit.");

  const buffer = await file.arrayBuffer();
  const adapter = detectTradebookBroker(buffer);
  if (!adapter) {
    throw new AppError(
      "Unrecognised file format.",
      "Upload a Zerodha tradebook XLSX (Console → Reports → Tradebook → Download as Excel)."
    );
  }

  const parseResult = adapter.parse(buffer);
  const fatalError = parseResult.errors.find((e) => e.severity === "error");
  if (fatalError) throw new AppError(fatalError.message);
  if (parseResult.trades.length === 0) {
    throw new AppError("No equity trades found in the file.");
  }

  const { accountId, accountLabel } = opts.accountId
    ? await resolveChosenAccount(supabase, opts.accountId)
    : await resolveAccountForImport(
        user,
        supabase,
        adapter,
        parseResult,
        // CSV exports carry no Client ID in their content — recover it from the
        // filename (e.g. "tradebook-YY7859-EQ.csv").
        parseResult.metadata.client_id ?? clientIdFromFileName(file.name)
      );

  const result = await executeTradebookImport(
    user.id,
    accountId,
    accountLabel,
    parseResult,
    file.name,
    { recompute: opts.recompute }
  );

  if (result.status === "failed") {
    throw new AppError(
      result.errors[0]?.message ?? "Import failed.",
      "Check the file and try again."
    );
  }

  return result;
}

export async function importTradebook(
  formData: FormData
): Promise<ActionResult<TradebookImportResult>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();

    const file = formData.get("file") as File | null;
    if (!file) throw new AppError("No file provided.");

    const result = await importOneFile(user, supabase, file, { recompute: true });

    log.info("Tradebook imported via server action", {
      userId: user.id,
      accountId: result.account_id,
      importedCount: result.imported_count,
    });

    return result;
  });
}

/**
 * Import multiple tradebook files in one request. Each file imports
 * independently — a bad file is reported but never blocks the rest — and FIFO
 * is recomputed once per affected account after all inserts, so file order is
 * irrelevant to correctness.
 */
export async function importTradebooks(
  formData: FormData
): Promise<ActionResult<BatchImportResult>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();

    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) throw new AppError("No files provided.");
    if (files.length > MAX_BATCH_FILES) {
      throw new AppError(`Too many files. Import at most ${MAX_BATCH_FILES} at a time.`);
    }

    const fileResults: BatchFileResult[] = [];
    const affectedAccounts = new Set<string>();

    for (const file of files) {
      try {
        const result = await importOneFile(user, supabase, file, { recompute: false });
        if (result.imported_count > 0) affectedAccounts.add(result.account_id);
        fileResults.push({
          file_name: file.name,
          status: "imported",
          imported_count: result.imported_count,
          skipped_count: result.skipped_count,
          account_label: result.account_label,
          error: null,
        });
      } catch (e) {
        fileResults.push({
          file_name: file.name,
          status: "failed",
          imported_count: 0,
          skipped_count: 0,
          account_label: null,
          error: e instanceof AppError ? e.message : "Import failed.",
        });
      }
    }

    // Recompute FIFO once per affected account (order-independent, correct).
    const admin = createAdminClient();
    for (const accountId of affectedAccounts) {
      await recomputeFifoForAccount(admin, user.id, accountId);
    }

    // Detect and auto-apply verified corporate actions per affected account.
    const allApplied: AppliedCorporateAction[] = [];
    const allPending: PendingCorporateAction[] = [];
    const allMergerSuggestions: OrphanPairSuggestion[] = [];
    const adminForCa = createAdminClient();
    for (const accountId of affectedAccounts) {
      const { applied, pending, mergerSuggestions } = await detectAndApplyForAccount(adminForCa, user.id, accountId);
      allApplied.push(...applied);
      allPending.push(...pending);
      allMergerSuggestions.push(...mergerSuggestions);
    }

    log.info("Batch tradebook import via server action", {
      userId: user.id,
      fileCount: files.length,
      accountsRecomputed: affectedAccounts.size,
      caApplied: allApplied.length,
      caPending: allPending.length,
      mergerSuggestions: allMergerSuggestions.length,
    });

    return {
      files: fileResults,
      total_imported: fileResults.reduce((s, f) => s + f.imported_count, 0),
      total_skipped: fileResults.reduce((s, f) => s + f.skipped_count, 0),
      accounts_recomputed: affectedAccounts.size,
      corporate_actions: { applied: allApplied, pending: allPending, merger_suggestions: allMergerSuggestions },
    };
  });
}

/**
 * Import a SINGLE file with FIFO recompute deferred. The client calls this once
 * per file so it can render live per-file progress, then calls
 * recomputeTradebookAccounts() once at the end.
 */
export async function importTradebookFile(
  formData: FormData
): Promise<ActionResult<TradebookImportResult>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const file = formData.get("file") as File | null;
    if (!file) throw new AppError("No file provided.");
    const accountId = (formData.get("accountId") as string | null) || undefined;
    return importOneFile(user, supabase, file, { recompute: false, accountId });
  });
}

/**
 * Recompute FIFO lot matches once per account. Called after a batch of
 * deferred-recompute file imports. Account IDs come from the client, so each is
 * verified to belong to the caller before the admin (RLS-bypassing) recompute.
 */
export async function recomputeTradebookAccounts(
  accountIds: string[]
): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const unique = [...new Set(accountIds)];
    if (unique.length === 0) return;

    // RLS scopes this to the caller's accounts only.
    const { data: owned } = await supabase
      .from("accounts")
      .select("id")
      .in("id", unique);
    const ownedIds = new Set((owned ?? []).map((a) => a.id));

    const admin = createAdminClient();
    for (const accountId of unique) {
      if (!ownedIds.has(accountId)) continue;
      await recomputeFifoForAccount(admin, user.id, accountId);
    }
  });
}

/**
 * After a batch of file imports (and FIFO recompute), detect and auto-apply
 * verified corporate actions for the affected accounts, and return any pending
 * candidates for user review.
 */
export async function detectCorporateActionsAfterImport(
  accountIds: string[]
): Promise<ActionResult<{ applied: AppliedCorporateAction[]; pending: PendingCorporateAction[]; merger_suggestions: OrphanPairSuggestion[] }>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const unique = [...new Set(accountIds)];
    if (unique.length === 0) return { applied: [], pending: [], merger_suggestions: [] };

    // RLS — verify all accounts belong to the caller.
    const { data: owned } = await supabase
      .from("accounts")
      .select("id")
      .in("id", unique);
    const ownedIds = new Set((owned ?? []).map((a) => a.id));

    const allApplied: AppliedCorporateAction[] = [];
    const allPending: PendingCorporateAction[] = [];
    const allMergerSuggestions: OrphanPairSuggestion[] = [];
    const admin = createAdminClient();
    for (const accountId of unique) {
      if (!ownedIds.has(accountId)) continue;
      const { applied, pending, mergerSuggestions } = await detectAndApplyForAccount(admin, user.id, accountId);
      allApplied.push(...applied);
      allPending.push(...pending);
      allMergerSuggestions.push(...mergerSuggestions);
    }

    return { applied: allApplied, pending: allPending, merger_suggestions: allMergerSuggestions };
  });
}

export async function getTradeImportHistory() {
  const { supabase } = await getAuthUser();
  const { data, error } = await supabase
    .from("import_tradebooks")
    .select("id, account_id, broker, client_id, date_from, date_to, file_name, status, imported_count, skipped_count, created_at, accounts(label, broker)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    log.error("getTradeImportHistory failed", { error: error.message });
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function deleteTradeImport(importId: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuthUser();
    const { error } = await supabase
      .from("import_tradebooks")
      .delete()
      .eq("id", importId);
    if (error) throw new Error(error.message);
  });
}

export async function applyCorporateAction(input: {
  stock_id: string; action_type: "split" | "bonus"; ex_date: string; factor: number; matched_stock_ids?: string[];
}): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    if (!(input.factor > 0)) throw new AppError("Invalid corporate-action factor.");
    const admin = createAdminClient();

    // ── Ownership gate ────────────────────────────────────────────────────────
    // Load the caller's own trades for this security using the RLS-scoped
    // client. RLS guarantees only their rows come back, so zero rows means
    // they have no stake in this security.
    const ids = [input.stock_id, ...(input.matched_stock_ids ?? [])];
    const tradeRows = await fetchAllRows<{
      id: string;
      user_id: string;
      account_id: string;
      symbol: string;
      isin: string;
      stock_id: string | null;
      trade_date: string;
      trade_type: string;
      quantity: number;
      price: number;
      executed_at: string | null;
      broker_trade_id: string;
    }>((from, to) =>
      supabase
        .from("trades")
        .select("id, user_id, account_id, symbol, isin, stock_id, trade_date, trade_type, quantity, price, executed_at, broker_trade_id")
        .in("stock_id", ids)
        .eq("excluded", false)
        .range(from, to)
    );

    if (tradeRows.length === 0) {
      throw new AppError("You don't have trades for this security.");
    }

    // ── Reconciliation gate ───────────────────────────────────────────────────
    // Re-derive the corporate action from the caller's own trade data and
    // confirm the posted factor is consistent (within 2%). Do NOT trust
    // input.factor — the client must prove the action is observable in their
    // trades.
    const trades: TradeForOpenPositions[] = tradeRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      account_id: r.account_id,
      symbol: r.symbol,
      isin: r.isin,
      stock_id: r.stock_id,
      trade_date: r.trade_date,
      trade_type: r.trade_type as "buy" | "sell",
      quantity: Number(r.quantity),
      price: Number(r.price),
      executed_at: r.executed_at,
      broker_trade_id: r.broker_trade_id,
    }));

    // Group trades by symbol into a single SecurityTrades entry.
    const symbol = trades[0].symbol;
    const isin = trades[0].isin;
    const account_id = trades[0].account_id;
    const securityTrades: SecurityTrades = {
      symbol,
      stock_id: input.stock_id,
      isin,
      account_id,
      trades,
      holdingsQty: null,
    };

    const ca = await loadCorporateActionContext(admin);
    const candidates = detectCorporateActions([securityTrades], ca);
    const ok = candidates.some(
      (c) =>
        c.action_type === input.action_type &&
        Math.abs(c.factor - input.factor) / input.factor <= 0.02
    );
    if (!ok) {
      throw new AppError("This corporate action doesn't reconcile with your trades.");
    }
    // ── End gates ─────────────────────────────────────────────────────────────

    if (input.matched_stock_ids?.length) {
      for (const old of input.matched_stock_ids) {
        if (old !== input.stock_id) {
          await admin.from("indian_stocks").update({ canonical_stock_id: input.stock_id }).eq("id", old);
        }
      }
    }
    const { error } = await admin.from("corporate_actions").upsert(
      { stock_id: input.stock_id, action_type: input.action_type, ex_date: input.ex_date, factor: input.factor, source: "inferred" },
      { onConflict: "stock_id,action_type,ex_date" });
    if (error) throw new AppError(error.message);

    // Recompute the caller's accounts that trade this canonical security.
    const { data: accts } = await supabase.from("accounts").select("id");
    for (const a of (accts ?? []) as Array<{ id: string }>) {
      await recomputeFifoForAccount(admin, user.id, a.id);
    }
  });
}

export async function recordMerger(input: {
  fromStockId: string;
  toStockId: string;
  ratio: number;
  exDate: string;
}): Promise<ActionResult> {
  return action(async () => {
    const today = new Date().toISOString().slice(0, 10);
    if (!(input.ratio > 0)) throw new AppError("Merger ratio must be greater than zero.");
    if (input.exDate > today) throw new AppError("Effective date cannot be in the future.");
    if (input.fromStockId === input.toStockId) throw new AppError("From and to securities must be different.");

    const { user, supabase } = await getAuthUser();
    const admin = createAdminClient();

    // Ownership gate: caller must have at least one non-excluded trade in the from-security.
    const { data: trades, error: tradeErr } = await supabase
      .from("trades")
      .select("id")
      .eq("stock_id", input.fromStockId)
      .eq("excluded", false)
      .limit(1);
    if (tradeErr) throw new AppError(tradeErr.message);
    if (!trades || trades.length === 0) {
      throw new AppError("You don't have trades for this security.");
    }

    // 1. Point the from-security at the canonical (to-security).
    //    The enforce_canonical_one_level trigger rejects chains automatically.
    const { error: canonErr } = await admin
      .from("indian_stocks")
      .update({ canonical_stock_id: input.toStockId })
      .eq("id", input.fromStockId);
    if (canonErr) throw new AppError(canonErr.message);

    // 2. Upsert the merger corporate action on the to-security.
    const { error: caErr } = await admin.from("corporate_actions").upsert(
      {
        stock_id: input.toStockId,
        action_type: "merger",
        ex_date: input.exDate,
        factor: input.ratio,
        source: "manual",
      },
      { onConflict: "stock_id,action_type,ex_date" }
    );
    if (caErr) throw new AppError(caErr.message);

    // 3. Recompute FIFO for all of the caller's accounts.
    const { data: accts } = await supabase.from("accounts").select("id");
    for (const a of (accts ?? []) as Array<{ id: string }>) {
      await recomputeFifoForAccount(admin, user.id, a.id);
    }
  });
}
