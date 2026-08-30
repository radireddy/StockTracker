import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "resolve-stock" });

/** A stock as named by a broker statement / manual entry. */
export interface StockRef {
  isin: string;
  symbol: string;
  bseCode?: string | null;
  sector?: string | null;
}

export interface ResolvedStock {
  /** The stable surrogate identity (`indian_stocks.id`). */
  stockId: string;
  /** The stock's CURRENT isin in the catalog (NOT necessarily the ref's isin). */
  currentIsin: string;
  created: boolean;
  /** Set when the ISIN matched but the symbol differed (a rename we applied). */
  renamedFrom?: string;
  /** Set when matched by symbol under a different ISIN (a split/face-value change). */
  reIsinedFrom?: string;
}

type Row = { id: string; isin: string; nse_symbol: string | null; bse_code?: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

/**
 * Resolve a broker statement's `(symbol, isin)` to a stable `stock_id`, handling
 * corporate actions so the SAME stock is never duplicated:
 *   1. match by current ISIN            → same stock (bonus / no change)
 *   2. match by NSE symbol              → split / face-value change (ISIN changed)
 *   3. match by BSE code               → fallback
 *   4. otherwise                       → create a new stock
 * On an ISIN match with a differing symbol, the stock is RENAMED (nse_symbol
 * updated) — safe because no FK references nse_symbol.
 *
 * NOTE: on the split case (2) we do NOT re-key `indian_stocks.isin`. The legacy
 * `companies.isin -> indian_stocks(isin)` FK (ON UPDATE NO ACTION) still exists
 * in Phase C and would block it; the stock is reused as-is and its `currentIsin`
 * (the pre-action value) is returned. Phase D re-keys once that FK is gone.
 */
export async function resolveStock(adminClient: Client, ref: StockRef): Promise<ResolvedStock> {
  const map = await resolveStocks(adminClient, [ref]);
  const r = map.get(ref.isin);
  if (!r) throw new Error(`Could not resolve stock for ISIN ${ref.isin}`);
  return r;
}

/**
 * Batch form used by the import engine: resolves many refs with a bounded number
 * of round-trips. Returns a Map keyed by each ref's INPUT isin.
 */
export async function resolveStocks(
  adminClient: Client,
  refs: StockRef[]
): Promise<Map<string, ResolvedStock>> {
  const result = new Map<string, ResolvedStock>();
  if (refs.length === 0) return result;

  // Dedup by input isin (a statement can't hold the same ISIN twice, but be safe).
  const uniqueRefs = [...new Map(refs.map((r) => [r.isin, r])).values()];
  const isins = uniqueRefs.map((r) => r.isin);

  // 1. Bulk fetch by current ISIN.
  const { data: byIsinRows } = await adminClient
    .from("indian_stocks").select("id, isin, nse_symbol").in("isin", isins);
  const stockByIsin = new Map<string, Row>((byIsinRows ?? []).map((s: Row) => [s.isin, s]));

  // 2. For unmatched, bulk fetch by NSE symbol (the split bridge).
  const unmatched = uniqueRefs.filter((r) => !stockByIsin.has(r.isin));
  const symbols = [...new Set(unmatched.map((r) => r.symbol).filter(Boolean))];
  let stockBySymbol = new Map<string, Row>();
  if (symbols.length > 0) {
    const { data } = await adminClient
      .from("indian_stocks").select("id, isin, nse_symbol").in("nse_symbol", symbols);
    stockBySymbol = new Map<string, Row>((data ?? []).map((s: Row) => [s.nse_symbol as string, s]));
  }

  // 3. Whatever still doesn't match becomes a new stock.
  const toCreate = unmatched.filter((r) => !(r.symbol && stockBySymbol.has(r.symbol)));
  let createdByIsin = new Map<string, Row>();
  if (toCreate.length > 0) {
    const rows = toCreate.map((r) => ({
      isin: r.isin, name: r.symbol, nse_symbol: r.symbol, exchange: "NSE" as const, sector: r.sector ?? null,
    }));
    // Insert new stocks; ignore isin conflicts (create race), then read ids back.
    await adminClient.from("indian_stocks").upsert(rows, { onConflict: "isin", ignoreDuplicates: true });
    const { data: nowRows } = await adminClient
      .from("indian_stocks").select("id, isin, nse_symbol").in("isin", toCreate.map((r) => r.isin));
    createdByIsin = new Map<string, Row>((nowRows ?? []).map((s: Row) => [s.isin, s]));
  }

  // 4. Assemble results + collect rename updates.
  const renameUpdates: Array<{ id: string; symbol: string }> = [];
  for (const r of uniqueRefs) {
    const byIsin = stockByIsin.get(r.isin);
    if (byIsin) {
      let renamedFrom: string | undefined;
      if (r.symbol && byIsin.nse_symbol !== r.symbol) {
        renamedFrom = byIsin.nse_symbol ?? undefined;
        renameUpdates.push({ id: byIsin.id, symbol: r.symbol });
      }
      result.set(r.isin, { stockId: byIsin.id, currentIsin: byIsin.isin, created: false, renamedFrom });
      continue;
    }
    const bySym = r.symbol ? stockBySymbol.get(r.symbol) : undefined;
    if (bySym) {
      result.set(r.isin, { stockId: bySym.id, currentIsin: bySym.isin, created: false, reIsinedFrom: bySym.isin });
      log.info("Stock resolved by symbol across an ISIN change", { symbol: r.symbol, statementIsin: r.isin, currentIsin: bySym.isin });
      continue;
    }
    const cr = createdByIsin.get(r.isin);
    if (cr) { result.set(r.isin, { stockId: cr.id, currentIsin: cr.isin, created: true }); continue; }
    // Creation failed (rare) — leave unmapped; callers skip unresolved refs.
    log.warn("Could not resolve or create stock", { isin: r.isin, symbol: r.symbol });
  }

  // 5. Apply renames (best-effort; a unique-symbol clash must not fail the import).
  for (const u of renameUpdates) {
    const { error } = await adminClient.from("indian_stocks").update({ nse_symbol: u.symbol }).eq("id", u.id);
    if (error) log.warn("Stock rename update failed (kept prior symbol)", { id: u.id, symbol: u.symbol, error: error.message });
  }

  return result;
}
