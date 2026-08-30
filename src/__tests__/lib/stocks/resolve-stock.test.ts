import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }),
}));

import { resolveStock, resolveStocks } from "@/lib/stocks/resolve-stock";

// --- a tiny chainable Supabase mock for indian_stocks -----------------------
type Row = { id: string; isin: string; nse_symbol: string | null; bse_code?: string | null };

function makeClient(seed: Row[], opts: { swallowUpsert?: boolean; failUpdate?: boolean } = {}) {
  const rows: Row[] = seed.map((r) => ({ ...r }));
  const captured = { updates: [] as Array<{ id: string; set: Record<string, unknown> }>, inserts: [] as Row[] };
  let seq = 0;

  function builder() {
    const op: {
      select?: string; insert?: unknown; upsert?: unknown; update?: Record<string, unknown>;
      eqCol?: string; eqVal?: unknown; inCol?: string; inVals?: unknown[];
    } = {};
    const b: Record<string, unknown> = {
      select(c: string) { op.select = c; return b; },
      insert(v: unknown) { op.insert = v; return b; },
      upsert(v: unknown) { op.upsert = v; return b; },
      update(v: Record<string, unknown>) { op.update = v; return b; },
      eq(c: string, v: unknown) { op.eqCol = c; op.eqVal = v; return b; },
      in(c: string, v: unknown[]) { op.inCol = c; op.inVals = v; return b; },
      maybeSingle() { return Promise.resolve(run(op, true)); },
      single() { return Promise.resolve(run(op, true)); },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(run(op, false)).then(onF, onR);
      },
    };
    return b;
  }

  function run(op: Record<string, unknown>, single: boolean): { data: unknown; error: unknown } {
    if (op.update) {
      const id = op.eqVal as string;
      captured.updates.push({ id, set: op.update as Record<string, unknown> });
      if (opts.failUpdate) return { data: null, error: { message: "unique_violation" } };
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, op.update);
      return { data: null, error: null };
    }
    if (op.insert) {
      const list = (Array.isArray(op.insert) ? op.insert : [op.insert]) as Array<Partial<Row>>;
      const created = list.map((r) => { seq += 1; const row = { id: `new-${seq}`, isin: r.isin!, nse_symbol: r.nse_symbol ?? null, bse_code: r.bse_code ?? null }; rows.push(row); return row; });
      captured.inserts.push(...created);
      return { data: single ? created[0] : created, error: null };
    }
    if (op.upsert) {
      if (opts.swallowUpsert) return { data: null, error: null }; // simulate a create that doesn't persist
      const list = (Array.isArray(op.upsert) ? op.upsert : [op.upsert]) as Array<Partial<Row>>;
      for (const r of list) if (!rows.find((x) => x.isin === r.isin)) { seq += 1; rows.push({ id: `new-${seq}`, isin: r.isin!, nse_symbol: r.nse_symbol ?? null, bse_code: r.bse_code ?? null }); }
      return { data: null, error: null };
    }
    // select
    let out = rows;
    if (op.eqCol) out = out.filter((r) => (r as Record<string, unknown>)[op.eqCol as string] === op.eqVal);
    if (op.inCol) out = out.filter((r) => (op.inVals as unknown[]).includes((r as Record<string, unknown>)[op.inCol as string]));
    return { data: single ? (out[0] ?? null) : out, error: null };
  }

  return { from: () => builder(), _rows: rows, _captured: captured };
}

beforeEach(() => vi.clearAllMocks());

describe("resolveStock", () => {
  it("matches by current ISIN", async () => {
    const c = makeClient([{ id: "s1", isin: "INE002A01018", nse_symbol: "RELIANCE" }]);
    const r = await resolveStock(c, { isin: "INE002A01018", symbol: "RELIANCE" });
    expect(r).toMatchObject({ stockId: "s1", currentIsin: "INE002A01018", created: false });
    expect(c._captured.inserts).toHaveLength(0);
  });

  it("matches by NSE symbol after a split changed the ISIN (does NOT re-key or duplicate)", async () => {
    const c = makeClient([{ id: "s2", isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }]);
    const r = await resolveStock(c, { isin: "INE419M01035", symbol: "TDPOWERSYS" });
    expect(r).toMatchObject({ stockId: "s2", currentIsin: "INE419M01027", created: false, reIsinedFrom: "INE419M01027" });
    expect(c._captured.inserts).toHaveLength(0); // reused, not duplicated
    // Phase C must NOT re-key the isin (isin FK still exists); no isin update.
    expect(c._captured.updates.filter((u) => "isin" in u.set)).toHaveLength(0);
  });

  it("updates the NSE symbol when the ISIN matches but the name changed (rename)", async () => {
    const c = makeClient([{ id: "s3", isin: "INE0X", nse_symbol: "OLDSYM" }]);
    const r = await resolveStock(c, { isin: "INE0X", symbol: "NEWSYM" });
    expect(r).toMatchObject({ stockId: "s3", renamedFrom: "OLDSYM" });
    expect(c._captured.updates).toContainEqual({ id: "s3", set: { nse_symbol: "NEWSYM" } });
  });

  it("still resolves the stock when a best-effort rename update fails", async () => {
    const c = makeClient([{ id: "s3", isin: "INE0X", nse_symbol: "OLDSYM" }], { failUpdate: true });
    const r = await resolveStock(c, { isin: "INE0X", symbol: "NEWSYM" });
    expect(r).toMatchObject({ stockId: "s3", renamedFrom: "OLDSYM" }); // rename attempted, error swallowed
  });

  it("throws when the stock can neither be matched nor created", async () => {
    const c = makeClient([], { swallowUpsert: true }); // create doesn't persist
    await expect(resolveStock(c, { isin: "INE404", symbol: "GHOST" })).rejects.toThrow(/Could not resolve/);
  });

  it("creates a new stock when nothing matches", async () => {
    const c = makeClient([]);
    const r = await resolveStock(c, { isin: "INE999", symbol: "NEWCO", sector: "IT" });
    expect(r).toMatchObject({ created: true, currentIsin: "INE999" });
    expect(c._rows.find((x: Row) => x.isin === "INE999")).toMatchObject({ nse_symbol: "NEWCO" });
  });
});

describe("resolveStocks (batch)", () => {
  it("returns an empty map for no refs", async () => {
    const c = makeClient([]);
    const map = await resolveStocks(c, []);
    expect(map.size).toBe(0);
  });

  it("omits refs whose stock could not be created", async () => {
    const c = makeClient([], { swallowUpsert: true });
    const map = await resolveStocks(c, [{ isin: "INE404", symbol: "GHOST" }]);
    expect(map.has("INE404")).toBe(false);
  });

  it("resolves a mixed batch: isin-match, split-by-symbol, and create — keyed by input isin", async () => {
    const c = makeClient([
      { id: "s1", isin: "INE002A01018", nse_symbol: "RELIANCE" },
      { id: "s2", isin: "INE419M01027", nse_symbol: "TDPOWERSYS" },
    ]);
    const map = await resolveStocks(c, [
      { isin: "INE002A01018", symbol: "RELIANCE" },      // by isin
      { isin: "INE419M01035", symbol: "TDPOWERSYS" },     // split → by symbol → s2
      { isin: "INE009A01021", symbol: "INFY" },           // new
    ]);
    expect(map.get("INE002A01018")).toMatchObject({ stockId: "s1", created: false });
    expect(map.get("INE419M01035")).toMatchObject({ stockId: "s2", created: false, reIsinedFrom: "INE419M01027" });
    expect(map.get("INE009A01021")).toMatchObject({ created: true });
    expect(map.size).toBe(3);
  });
});
