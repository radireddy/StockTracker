import { createAdminClient } from "@/lib/supabase/admin";
import { createLogger } from "@/lib/logger";
import { resolveStocks } from "@/lib/stocks/resolve-stock";
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

  // 1. Resolve every statement stock to a stable stock_id ----------------------
  // resolveStocks matches by current ISIN, then by NSE symbol (a split/face-value
  // change re-uses the SAME stock under its new ISIN), then by BSE code, and only
  // creates a fresh stock as a last resort. This is what prevents a corporate
  // action from ever forking a stock into a duplicate catalog row.
  const refs = uniqueIsins.map((isin) => {
    const h = holdings.find((x) => x.isin === isin)!;
    return { isin, symbol: h.symbol, sector: h.sector };
  });
  const resolved = await resolveStocks(adminClient, refs);

  const migratedSymbols: string[] = [];
  for (const isin of uniqueIsins) {
    const r = resolved.get(isin);
    const h = holdings.find((x) => x.isin === isin)!;
    if (!r) {
      errors.push({ symbol: h.symbol, message: `Could not register stock (ISIN ${isin})` });
    } else if (r.reIsinedFrom) {
      migratedSymbols.push(h.symbol); // reused an existing stock across an ISIN change
    }
  }

  // 2. Find or create the company for each resolved stock, keyed by stock_id ----
  const stockIds = [...new Set([...resolved.values()].map((r) => r.stockId))];
  const isinByStockId = new Map<string, string>();
  const symbolByStockId = new Map<string, string>();
  for (const isin of uniqueIsins) {
    const r = resolved.get(isin);
    if (!r) continue;
    isinByStockId.set(r.stockId, r.currentIsin);
    symbolByStockId.set(r.stockId, holdings.find((x) => x.isin === isin)!.symbol);
  }

  const { data: existingCompanies } = await userSupabase
    .from("companies")
    .select("id, stock_id")
    .eq("portfolio_id", portfolioId)
    .in("stock_id", stockIds);
  const companyByStockId = new Map<string, string>(
    (existingCompanies ?? []).map((c: { id: string; stock_id: string }) => [c.stock_id, c.id] as [string, string])
  );

  const missingStockIds = stockIds.filter((sid) => !companyByStockId.has(sid));
  if (missingStockIds.length > 0) {
    const companyRows = missingStockIds.map((sid) => ({
      user_id: userId,
      portfolio_id: portfolioId,
      stock_id: sid,
      isin: isinByStockId.get(sid)!, // the stock's CURRENT isin (a valid catalog value)
    }));
    // Fast path: create every missing company stub in one round-trip.
    const { data: createdRows, error: bulkErr } = await userSupabase
      .from("companies")
      .insert(companyRows)
      .select("id, stock_id");
    if (!bulkErr && createdRows) {
      for (const row of createdRows as Array<{ id: string; stock_id: string }>) {
        companyByStockId.set(row.stock_id, row.id);
        const sym = symbolByStockId.get(row.stock_id);
        if (sym) newCompaniesCreated.push(sym);
      }
    } else {
      // Fallback: a bulk insert aborts wholesale if any single row conflicts, so
      // re-attempt each stock individually — inserting the genuinely new ones and
      // recovering the id of any that lost a create race.
      for (const sid of missingStockIds) {
        if (companyByStockId.has(sid)) continue;
        const { data: created, error: createErr } = await userSupabase
          .from("companies")
          .insert({ user_id: userId, portfolio_id: portfolioId, stock_id: sid, isin: isinByStockId.get(sid)! })
          .select("id")
          .single();
        if (createErr) {
          // Race: someone created it — re-read by (portfolio, stock_id).
          const { data: existing } = await userSupabase
            .from("companies")
            .select("id")
            .eq("portfolio_id", portfolioId)
            .eq("stock_id", sid)
            .single();
          if (existing) {
            companyByStockId.set(sid, existing.id as string);
          } else {
            errors.push({ symbol: symbolByStockId.get(sid), message: `Could not create company: ${createErr.message}` });
          }
        } else {
          companyByStockId.set(sid, created.id as string);
          const sym = symbolByStockId.get(sid);
          if (sym) newCompaniesCreated.push(sym);
        }
      }
    }
  }

  // 3. Build the fresh snapshot rows -------------------------------------------
  // Each row carries stock_id AND the stock's current isin. (The current
  // replace_account_holdings RPC inserts isin; the sync trigger derives stock_id
  // from it. Passing stock_id too is forward-compatible for Phase D.)
  const symbolsImported: string[] = [];
  const symbolsSkipped: string[] = [];
  const rows = holdings
    .filter((h) => {
      const r = resolved.get(h.isin);
      const ok = !!r && companyByStockId.has(r.stockId);
      if (!ok) symbolsSkipped.push(h.symbol);
      return ok;
    })
    .map((h) => {
      const r = resolved.get(h.isin)!;
      symbolsImported.push(h.symbol);
      return {
        user_id: userId,
        portfolio_id: portfolioId,
        account_id: accountId,
        company_id: companyByStockId.get(r.stockId)!,
        stock_id: r.stockId,
        isin: r.currentIsin,
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
    migrated_companies: migratedSymbols,
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
        migrated_companies: result.migrated_companies,
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
