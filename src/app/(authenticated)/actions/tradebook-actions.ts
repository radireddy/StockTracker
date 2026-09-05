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
import type {
  TradebookImportResult,
  BatchImportResult,
  BatchFileResult,
  TradebookAdapter,
  TradebookParseResult,
  AppliedCorporateAction,
  PendingCorporateAction,
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
      "Ensure the file name is like 'tradebook-<ClientID>-EQ.csv', or use the Excel export."
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

/**
 * Parse one file, resolve its account, and insert its trades. FIFO recompute is
 * controlled by `recompute` — the batch path defers it so it can recompute once
 * per account after all files are inserted. Throws AppError on any file problem.
 */
async function importOneFile(
  user: AuthCtx["user"],
  supabase: AuthCtx["supabase"],
  file: File,
  opts: { recompute: boolean }
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

  // CSV exports carry no Client ID in their content — recover it from the
  // filename (e.g. "tradebook-YY7859-EQ.csv").
  const clientId = parseResult.metadata.client_id ?? clientIdFromFileName(file.name);

  const { accountId, accountLabel } = await resolveAccountForImport(
    user,
    supabase,
    adapter,
    parseResult,
    clientId
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
    const adminForCa = createAdminClient();
    for (const accountId of affectedAccounts) {
      const { applied, pending } = await detectAndApplyForAccount(adminForCa, user.id, accountId);
      allApplied.push(...applied);
      allPending.push(...pending);
    }

    log.info("Batch tradebook import via server action", {
      userId: user.id,
      fileCount: files.length,
      accountsRecomputed: affectedAccounts.size,
      caApplied: allApplied.length,
      caPending: allPending.length,
    });

    return {
      files: fileResults,
      total_imported: fileResults.reduce((s, f) => s + f.imported_count, 0),
      total_skipped: fileResults.reduce((s, f) => s + f.skipped_count, 0),
      accounts_recomputed: affectedAccounts.size,
      corporate_actions: { applied: allApplied, pending: allPending },
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
    return importOneFile(user, supabase, file, { recompute: false });
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
): Promise<ActionResult<{ applied: AppliedCorporateAction[]; pending: PendingCorporateAction[] }>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const unique = [...new Set(accountIds)];
    if (unique.length === 0) return { applied: [], pending: [] };

    // RLS — verify all accounts belong to the caller.
    const { data: owned } = await supabase
      .from("accounts")
      .select("id")
      .in("id", unique);
    const ownedIds = new Set((owned ?? []).map((a) => a.id));

    const allApplied: AppliedCorporateAction[] = [];
    const allPending: PendingCorporateAction[] = [];
    const admin = createAdminClient();
    for (const accountId of unique) {
      if (!ownedIds.has(accountId)) continue;
      const { applied, pending } = await detectAndApplyForAccount(admin, user.id, accountId);
      allApplied.push(...applied);
      allPending.push(...pending);
    }

    return { applied: allApplied, pending: allPending };
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
