import { getAuthUserOrNull } from "@/lib/supabase/server";
import { executeHoldingsImport } from "@/lib/import/holdings-import-engine";
import { parseStatementBuffer } from "@/lib/import/parse-statement";
import { shouldBackfillClientId } from "@/lib/accounts";
import { type BrokerType } from "@/lib/import/types";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

const log = createLogger({ service: "import-api" });

/**
 * POST /api/import
 * Import a broker HOLDINGS statement into a portfolio (synchronous).
 * - Auto-detects the account from the statement's (broker, client_id).
 * - Fresh account → created (label from `account_label` or a default).
 * - Existing account with holdings → treated as a reimport (replace).
 * Requires: file, portfolio_id. Optional: account_id (target an account explicitly),
 *           account_label (label for a newly created account), broker (hint).
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const portfolioId = formData.get("portfolio_id") as string;
  if (!portfolioId) return NextResponse.json({ error: "No portfolio selected" }, { status: 400 });

  const explicitAccountId = (formData.get("account_id") as string) || null;
  const accountLabelOverride = ((formData.get("account_label") as string) || "").trim() || null;
  const brokerHint = formData.get("broker") as BrokerType | null;

  // Validate portfolio
  const { data: portfolio, error: pErr } = await supabase
    .from("portfolios")
    .select("id, type, name")
    .eq("id", portfolioId)
    .single();
  if (pErr || !portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  if (portfolio.type !== "holdings") {
    return NextResponse.json({ error: "Holdings can only be imported into holdings-type portfolios" }, { status: 400 });
  }

  // Read, validate & parse the file (shared with the detect route).
  const buffer = await file.arrayBuffer();
  const parsed = parseStatementBuffer(buffer, brokerHint);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { adapter, parseResult } = parsed;

  // ---- Resolve the target account -------------------------------------------
  const broker = adapter.broker;
  const clientId = parseResult.metadata.client_id;

  let accountId: string;
  let accountLabel: string;
  let isReimport = false;

  if (explicitAccountId) {
    const { data: acct, error } = await supabase
      .from("accounts")
      .select("id, label, client_id")
      .eq("id", explicitAccountId)
      .single();
    if (error || !acct) return NextResponse.json({ error: "Selected account not found" }, { status: 404 });
    accountId = acct.id;
    accountLabel = acct.label;

    // Linking a statement to an account that has no Client ID yet: backfill it
    // (and the broker) so future imports auto-detect this account. Never
    // overwrite an existing, different Client ID.
    if (shouldBackfillClientId(acct, clientId)) {
      const { error: upErr } = await supabase
        .from("accounts")
        .update({ broker, client_id: clientId })
        .eq("id", accountId);
      if (upErr?.code === "23505") {
        return NextResponse.json(
          { error: "Another account already uses that Client ID for this broker. Rename or merge before linking." },
          { status: 409 }
        );
      }
      if (upErr) return NextResponse.json({ error: `Failed to link account: ${upErr.message}` }, { status: 500 });
    }
  } else if (clientId) {
    const { data: acct } = await supabase
      .from("accounts")
      .select("id, label")
      .eq("broker", broker)
      .eq("client_id", clientId)
      .maybeSingle();
    if (acct) {
      accountId = acct.id;
      accountLabel = acct.label;
    } else {
      const label = accountLabelOverride || parseResult.metadata.account_label || `${clientId} (${adapter.displayName})`;
      const { data: created, error: cErr } = await supabase
        .from("accounts")
        .insert({ user_id: user.id, label, broker, client_id: clientId })
        .select("id, label")
        .single();
      if (cErr || !created) {
        return NextResponse.json({ error: `Failed to create account: ${cErr?.message}` }, { status: 500 });
      }
      accountId = created.id;
      accountLabel = created.label;
    }
  } else {
    return NextResponse.json(
      { error: "Could not read a Client ID from the statement. Please create an account and select it before importing." },
      { status: 400 }
    );
  }

  // Reimport if this account already has holdings in this portfolio.
  const { count: existingCount } = await supabase
    .from("holdings")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId)
    .eq("account_id", accountId);
  isReimport = (existingCount ?? 0) > 0;

  // ---- Record the import + write holdings ------------------------------------
  const { data: batch, error: batchErr } = await supabase
    .from("import_holdings")
    .insert({
      user_id: user.id,
      portfolio_id: portfolioId,
      account_id: accountId,
      broker,
      client_id: clientId,
      statement_date: parseResult.metadata.statement_date,
      file_name: file.name,
      is_reimport: isReimport,
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    log.error("Failed to create import record", { error: batchErr?.message });
    return NextResponse.json({ error: "Failed to create import record" }, { status: 500 });
  }

  try {
    const result = await executeHoldingsImport(
      user.id,
      portfolioId,
      accountId,
      accountLabel,
      batch.id,
      parseResult,
      isReimport,
      supabase
    );
    return NextResponse.json({
      import_id: batch.id,
      broker: adapter.broker,
      broker_name: adapter.displayName,
      ...result,
      parse_warnings: parseResult.errors.filter((e) => e.severity === "warning").length,
    });
  } catch (err) {
    log.error("Import failed", { importId: batch.id, error: (err as Error).message });
    await supabase
      .from("import_holdings")
      .update({ status: "failed", errors: [{ message: (err as Error).message }] })
      .eq("id", batch.id);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * GET /api/import?id=<id>   — full detail for a single import
 * GET /api/import            — recent imports (last 20)
 */
export async function GET(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const { data, error } = await supabase
      .from("import_holdings")
      .select("*, accounts(label, broker)")
      .eq("id", id)
      .single();
    if (error || !data) return NextResponse.json({ error: "Import not found" }, { status: 404 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("import_holdings")
    .select("id, portfolio_id, account_id, broker, client_id, statement_date, file_name, status, is_reimport, companies_count, imported_count, skipped_count, created_at, accounts(label, broker)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/**
 * DELETE /api/import?id=<id>  — delete a single import record
 * DELETE /api/import          — delete all import records for the user
 *
 * Note: this removes the import history rows only; it does not delete holdings.
 */
export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  const query = supabase.from("import_holdings").delete();
  const { error } = id ? await query.eq("id", id) : await query.eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
