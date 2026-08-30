"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { detectTradebookBroker } from "@/lib/import/tradebook-broker-registry";
import { executeTradebookImport } from "@/lib/import/tradebook-import-engine";
import { shouldBackfillClientId } from "@/lib/accounts";
import { action, AppError, type ActionResult } from "@/lib/action-result";
import { createLogger } from "@/lib/logger";
import type { TradebookImportResult } from "@/lib/import/tradebook-types";

const log = createLogger({ service: "tradebook-actions" });
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function importTradebook(
  formData: FormData
): Promise<ActionResult<TradebookImportResult>> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();

    const file = formData.get("file") as File | null;
    if (!file) throw new AppError("No file provided.");
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

    // ── Resolve account ──────────────────────────────────────────────────────
    const broker   = adapter.broker;
    const clientId = parseResult.metadata.client_id;

    let accountId: string;
    let accountLabel: string;

    if (clientId) {
      const { data: existing } = await supabase
        .from("accounts")
        .select("id, label, client_id")
        .eq("broker", broker)
        .eq("client_id", clientId)
        .maybeSingle();

      if (existing) {
        accountId    = existing.id;
        accountLabel = existing.label;
      } else {
        const label = parseResult.metadata.account_label ?? `${clientId} (${adapter.displayName})`;
        const { data: created, error: cErr } = await supabase
          .from("accounts")
          .insert({ user_id: user.id, label, broker, client_id: clientId })
          .select("id, label")
          .single();
        if (cErr || !created) {
          throw new AppError(`Failed to create account: ${cErr?.message ?? "unknown error"}`);
        }
        accountId    = created.id;
        accountLabel = created.label;
      }
    } else {
      throw new AppError(
        "Could not read a Client ID from the tradebook.",
        "Ensure you downloaded the file from your Zerodha Console account."
      );
    }

    const result = await executeTradebookImport(
      user.id,
      accountId,
      accountLabel,
      parseResult,
      file.name
    );

    if (result.status === "failed") {
      throw new AppError(
        result.errors[0]?.message ?? "Import failed.",
        "Check the file and try again."
      );
    }

    log.info("Tradebook imported via server action", {
      userId: user.id,
      accountId,
      importedCount: result.imported_count,
    });

    return result;
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
