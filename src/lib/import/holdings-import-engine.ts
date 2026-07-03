import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import type { HoldingsParseResult, ImportResult } from "./types";

const log = createLogger({ service: "holdings-import-engine" });

/**
 * Holdings Import Engine — writes a statement snapshot for one account.
 *
 * Semantics (replace-on-account, idempotent):
 *  1. Auto-create any unknown stocks in `indian_stocks`.
 *  2. Auto-create `companies (portfolio_id, isin)` rows for new ISINs (research stubs).
 *  3. Build the fresh position rows (skipping any whose company could not be resolved).
 *  4. Atomically replace `holdings` for (portfolio_id, account_id) via the
 *     `replace_account_holdings` RPC (delete+insert in one transaction). This wipes the
 *     previous statement AND any manual edits for that account — but only when there are
 *     rows to insert. If every row was skipped, the replace is skipped and existing
 *     holdings are preserved, so an incomplete import can never lose data.
 *  5. Record the outcome on the `import_holdings` row.
 *
 * Re-importing the same file yields the same end state.
 */
export async function executeHoldingsImport(
  userId: string,
  portfolioId: string,
  accountId: string,
  accountLabel: string,
  importHoldingId: string,
  parseResult: HoldingsParseResult,
  isReimport: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSupabase: any
): Promise<ImportResult> {
  const adminClient = createAdminClient();
  const errors: Array<{ symbol?: string; message: string }> = [];
  const newCompaniesCreated: string[] = [];
  const holdings = parseResult.holdings;

  for (const w of parseResult.errors) {
    if (w.severity === "error") errors.push({ symbol: w.symbol, message: w.message });
  }

  const uniqueIsins = [...new Set(holdings.map((h) => h.isin))];

  // 1. Ensure stocks exist ------------------------------------------------------
  const { data: stocks } = await adminClient
    .from("indian_stocks")
    .select("isin")
    .in("isin", uniqueIsins);
  const knownIsins = new Set<string>((stocks ?? []).map((s: { isin: string }) => s.isin));

  const missingIsins = uniqueIsins.filter((isin) => !knownIsins.has(isin));
  for (const isin of missingIsins) {
    const h = holdings.find((x) => x.isin === isin)!;
    const { error: insertErr } = await adminClient
      .from("indian_stocks")
      .upsert(
        { isin, name: h.symbol, nse_symbol: h.symbol, exchange: "NSE" as const },
        { onConflict: "isin", ignoreDuplicates: true }
      );
    if (insertErr) {
      const { error: retryErr } = await adminClient
        .from("indian_stocks")
        .upsert({ isin, name: h.symbol, exchange: "NSE" as const }, { onConflict: "isin", ignoreDuplicates: true });
      if (retryErr) {
        errors.push({ symbol: h.symbol, message: `Could not register stock (ISIN ${isin}): ${retryErr.message}` });
        continue;
      }
    }
    knownIsins.add(isin);
  }

  // 2. Ensure companies exist (research stubs) ---------------------------------
  const { data: existingCompanies } = await userSupabase
    .from("companies")
    .select("id, isin")
    .eq("portfolio_id", portfolioId)
    .in("isin", uniqueIsins);
  const companyMap = new Map<string, string>(
    (existingCompanies ?? []).map((c: { id: string; isin: string }) => [c.isin, c.id] as [string, string])
  );

  for (const isin of uniqueIsins) {
    if (companyMap.has(isin) || !knownIsins.has(isin)) continue;
    const h = holdings.find((x) => x.isin === isin)!;
    const { data: created, error: createErr } = await userSupabase
      .from("companies")
      .insert({ user_id: userId, portfolio_id: portfolioId, isin })
      .select("id")
      .single();
    if (createErr) {
      // Race: someone created it — re-read.
      const { data: existing } = await userSupabase
        .from("companies")
        .select("id")
        .eq("portfolio_id", portfolioId)
        .eq("isin", isin)
        .single();
      if (existing) {
        companyMap.set(isin, existing.id as string);
      } else {
        errors.push({ symbol: h.symbol, message: `Could not create company: ${createErr.message}` });
      }
    } else {
      companyMap.set(isin, created.id as string);
      newCompaniesCreated.push(h.symbol);
    }
  }

  // 3. Build the fresh snapshot rows -------------------------------------------
  const symbolsImported: string[] = [];
  const symbolsSkipped: string[] = [];
  const rows = holdings
    .filter((h) => {
      const ok = companyMap.has(h.isin);
      if (!ok) symbolsSkipped.push(h.symbol);
      return ok;
    })
    .map((h) => {
      symbolsImported.push(h.symbol);
      return {
        user_id: userId,
        portfolio_id: portfolioId,
        account_id: accountId,
        company_id: companyMap.get(h.isin)!,
        isin: h.isin,
        quantity: h.quantity,
        avg_buy_price: h.avg_price,
        sector: h.sector,
        source: "zerodha",
        import_holding_id: importHoldingId,
      };
    });

  // 4. Atomically replace this account's holdings ------------------------------
  // The delete+insert run inside a single Postgres transaction (see
  // `replace_account_holdings`), so a failed insert can never leave the account
  // wiped. When there is nothing to insert (every row was skipped), we skip the
  // replace entirely — existing holdings must never be lost on an incomplete import.
  if (rows.length > 0) {
    const { error: rpcErr } = await userSupabase.rpc("replace_account_holdings", {
      p_portfolio_id: portfolioId,
      p_account_id: accountId,
      p_rows: rows,
    });
    if (rpcErr) {
      log.error("Failed to replace holdings", { error: rpcErr.message, portfolioId, accountId });
      throw new Error(`Failed to replace holdings: ${rpcErr.message}`);
    }
  } else {
    log.warn("Skipping holdings replace — no importable rows; existing holdings preserved", {
      portfolioId,
      accountId,
      skipped: symbolsSkipped.length,
    });
  }

  const result: ImportResult = {
    status: rows.length === 0 && errors.length > 0 ? "failed" : "completed",
    is_reimport: isReimport,
    account_id: accountId,
    account_label: accountLabel,
    imported_count: symbolsImported.length,
    skipped_count: symbolsSkipped.length,
    companies_count: rows.length,
    new_companies_created: newCompaniesCreated,
    symbols_imported: symbolsImported,
    symbols_skipped: symbolsSkipped,
    statement_date: parseResult.metadata.statement_date,
    client_id: parseResult.metadata.client_id,
    errors,
  };

  // 5. Finalize the import_holdings record -------------------------------------
  // The holdings themselves are already committed (step 4), so a failure here only
  // means the history row is stale — never that the import failed. We surface it in
  // the logs (with a flag) and carry on rather than reporting a successful import
  // as failed.
  const { error: finalizeErr } = await userSupabase
    .from("import_holdings")
    .update({
      status: result.status,
      is_reimport: isReimport,
      companies_count: result.companies_count,
      imported_count: result.imported_count,
      skipped_count: result.skipped_count,
      summary: {
        symbols_imported: result.symbols_imported,
        symbols_skipped: result.symbols_skipped,
        new_companies_created: result.new_companies_created,
        statement_date: result.statement_date,
        client_id: result.client_id,
        account_label: accountLabel,
      },
      errors: result.errors,
    })
    .eq("id", importHoldingId);

  if (finalizeErr) {
    log.error("Failed to finalize import_holdings record (holdings were still imported)", {
      error: finalizeErr.message,
      importHoldingId,
      accountId,
    });
  }

  log.info("Holdings import completed", {
    importHoldingId,
    accountId,
    isReimport,
    imported: result.imported_count,
    companies: result.companies_count,
  });

  return result;
}
