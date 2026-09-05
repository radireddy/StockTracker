import { createLogger } from "@/lib/logger";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { CorporateAction, CorporateActionContext } from "./corporate-actions";

const log = createLogger({ service: "corporate-actions-data" });

const EMPTY: CorporateActionContext = {
  canonicalMap: new Map(),
  actionsBySecurity: new Map(),
};

export interface RefAction {
  symbol: string;
  isin: string | null;
  action_type: "split" | "bonus";
  ex_date: string;
  factor: number;
}

/** Feed rows for the given symbols, grouped by symbol. Empty on missing table. */
export async function loadRefBySymbols(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  symbols: string[]
): Promise<Map<string, RefAction[]>> {
  const out = new Map<string, RefAction[]>();
  const unique = [...new Set(symbols.filter(Boolean))];
  if (unique.length === 0) return out;
  try {
    const rows = await fetchAllRows<RefAction>((from, to) =>
      client
        .from("corporate_action_ref")
        .select("symbol, isin, action_type, ex_date, factor")
        .in("symbol", unique)
        .order("ex_date", { ascending: true })
        .range(from, to)
    );
    for (const r of rows) {
      const list = out.get(r.symbol) ?? [];
      list.push({ ...r, factor: Number(r.factor) });
      out.set(r.symbol, list);
    }
  } catch {
    return out; // table not present yet → no verification, all candidates inferred
  }
  return out;
}

/**
 * Load global corporate-action reference data: the ISIN-supersession map
 * (superseded stock_id -> canonical stock_id) and split/bonus factors keyed by
 * canonical stock_id.
 *
 * Resilient by design: if the 006 migration hasn't been applied yet (tables /
 * column missing), returns an empty context so FIFO behaves exactly as before.
 *
 * When stockIds is provided and non-empty, filters the corporate_actions query
 * to those stock IDs only.
 */
export async function loadCorporateActionContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  stockIds?: string[]
): Promise<CorporateActionContext> {
  try {
    const canonicalMap = new Map<string, string>();
    const { data: forks, error: forkErr } = await client
      .from("indian_stocks")
      .select("id, canonical_stock_id")
      .not("canonical_stock_id", "is", null);
    if (forkErr) throw forkErr;
    for (const r of (forks ?? []) as Array<{ id: string; canonical_stock_id: string }>) {
      canonicalMap.set(r.id, r.canonical_stock_id);
    }

    const actionsBySecurity = new Map<string, CorporateAction[]>();
    let query = client
      .from("corporate_actions")
      .select("stock_id, action_type, ex_date, factor");

    // Apply stock_id filter if provided and non-empty
    if (stockIds && stockIds.length > 0) {
      query = query.in("stock_id", stockIds);
    }

    const { data: actions, error: actErr } = await query;
    if (actErr) throw actErr;
    for (const a of (actions ?? []) as Array<{
      stock_id: string;
      action_type: "split" | "bonus";
      ex_date: string;
      factor: number | string;
    }>) {
      const list = actionsBySecurity.get(a.stock_id) ?? [];
      list.push({
        stock_id: a.stock_id,
        action_type: a.action_type,
        ex_date: a.ex_date,
        factor: Number(a.factor),
      });
      actionsBySecurity.set(a.stock_id, list);
    }

    return { canonicalMap, actionsBySecurity };
  } catch (e) {
    // Migration not applied yet, or a transient read error — degrade to no-CA.
    log.warn("corporate-action context unavailable; proceeding without it", {
      error: e instanceof Error ? e.message : String(e),
    });
    return EMPTY;
  }
}
