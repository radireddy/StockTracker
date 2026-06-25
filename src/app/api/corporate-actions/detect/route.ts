import { getAuthUserOrNull } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { detectAnomalies } from "@/lib/import/corporate-action-detector";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "corporate-action-detect" });

/**
 * POST /api/corporate-actions/detect
 * Run corporate action detection across ALL transactions for a given owner+portfolio.
 * Should be called once after all tradebook files have been imported.
 *
 * Body: { portfolio_id, owner_id }
 *
 * Flow:
 * 1. Delete any existing "pending" + "auto_detected" actions for this portfolio (stale detections)
 * 2. Fetch all transactions for this owner
 * 3. Run detection on the full dataset
 * 4. Persist new detections
 * 5. Return the anomalies
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { portfolio_id, owner_id } = body;

  if (!portfolio_id || !owner_id)
    return NextResponse.json(
      { error: "portfolio_id and owner_id are required" },
      { status: 400 }
    );

  try {
    // 1. Clear stale auto-detected pending actions for this portfolio
    await supabase
      .from("corporate_actions")
      .delete()
      .eq("portfolio_id", portfolio_id)
      .eq("source", "auto_detected")
      .eq("status", "pending");

    // 2. Fetch all transactions for this owner with ISIN (via company join)
    const { data: allTxns, error: txnErr } = await supabase
      .from("transactions")
      .select("type, quantity, price, date, company_id, companies(isin)")
      .eq("owner_id", owner_id)
      .order("date");

    if (txnErr) {
      log.error("Failed to fetch transactions for detection", { error: txnErr.message });
      return NextResponse.json({ error: txnErr.message }, { status: 500 });
    }

    if (!allTxns || allTxns.length === 0) {
      return NextResponse.json({ anomalies: [] });
    }

    // 3. Build a symbol lookup from indian_stocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getIsin = (companies: any): string | undefined => {
      if (!companies) return undefined;
      if (Array.isArray(companies)) return companies[0]?.isin;
      return companies.isin;
    };

    const uniqueIsins = [
      ...new Set(
        allTxns
          .map((t) => getIsin(t.companies))
          .filter(Boolean) as string[]
      ),
    ];

    const { data: stocks } = await supabase
      .from("indian_stocks")
      .select("isin, name, nse_symbol, bse_code")
      .in("isin", uniqueIsins);

    const isinToSymbol = new Map<string, string>();
    for (const s of stocks ?? []) {
      isinToSymbol.set(
        s.isin,
        s.nse_symbol ?? s.bse_code ?? s.name ?? s.isin
      );
    }

    // 4. Build the transactions list for detection
    const txnsForDetection: Array<{
      symbol: string;
      isin: string;
      type: string;
      quantity: number;
      price: number;
      date: string;
    }> = [];

    for (const txn of allTxns) {
      const isin = getIsin(txn.companies);
      if (!isin) continue;
      txnsForDetection.push({
        symbol: isinToSymbol.get(isin) ?? isin,
        isin,
        type: txn.type,
        quantity: Number(txn.quantity),
        price: Number(txn.price),
        date: txn.date,
      });
    }

    // 5. Run detection — pass empty newTrades since everything is already in DB
    const anomalies = detectAnomalies([], txnsForDetection);

    // 6. Persist detected anomalies
    if (anomalies.length > 0) {
      const rows = anomalies.map((a) => ({
        user_id: user.id,
        portfolio_id,
        symbol: a.symbol,
        isin: a.isin,
        action_type: a.type,
        ex_date:
          a.estimated_date_to ??
          a.estimated_date_from ??
          new Date().toISOString().slice(0, 10),
        ratio_from: a.suggested_ratio_from ?? null,
        ratio_to: a.suggested_ratio_to ?? null,
        new_symbol: a.new_symbol ?? a.new_symbol_rename ?? null,
        new_isin: a.new_isin ?? null,
        old_symbol: a.old_symbol ?? null,
        status: "pending" as const,
        source: "auto_detected" as const,
        notes: a.details,
      }));

      const { error: insertErr } = await supabase
        .from("corporate_actions")
        .insert(rows);

      if (insertErr) {
        log.error("Failed to persist anomalies", { error: insertErr.message });
      }
    }

    log.info("Corporate action detection complete", {
      portfolio_id,
      owner_id,
      total_transactions: txnsForDetection.length,
      anomalies_found: anomalies.length,
    });

    return NextResponse.json({ anomalies });
  } catch (err) {
    log.error("Detection failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
