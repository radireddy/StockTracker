import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HoldingsParseResult, ParsedHolding } from "@/lib/import/types";

// --- module mocks --------------------------------------------------------
let mockAdminClient: ReturnType<typeof makeAdminClient>;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }),
}));

import { executeHoldingsImport } from "@/lib/import/holdings-import-engine";

// --- indian_stocks admin mock (used by resolveStocks) ----------------------
type StockRow = { id: string; isin: string; nse_symbol: string | null };

function makeAdminClient(seed: StockRow[], swallowUpsert = false) {
  const rows: StockRow[] = seed.map((r) => ({ ...r }));
  let seq = 0;
  function builder() {
    const op: Record<string, unknown> = {};
    const b: Record<string, unknown> = {
      select(c: string) { op.select = c; return b; },
      upsert(v: unknown) { op.upsert = v; return b; },
      update(v: unknown) { op.update = v; return b; },
      eq(c: string, v: unknown) { op.eqCol = c; op.eqVal = v; return b; },
      in(c: string, v: unknown[]) { op.inCol = c; op.inVals = v; return b; },
      then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(run(op)).then(onF, onR);
      },
    };
    return b;
  }
  function run(op: Record<string, unknown>) {
    if (op.upsert) {
      if (swallowUpsert) return { data: null, error: null }; // simulate a stock create that doesn't persist
      const list = (Array.isArray(op.upsert) ? op.upsert : [op.upsert]) as Array<Partial<StockRow>>;
      for (const r of list) if (!rows.find((x) => x.isin === r.isin)) { seq += 1; rows.push({ id: `stk-${seq}`, isin: r.isin!, nse_symbol: r.nse_symbol ?? null }); }
      return { data: null, error: null };
    }
    if (op.update) {
      const row = rows.find((r) => r.id === op.eqVal);
      if (row) Object.assign(row, op.update);
      return { data: null, error: null };
    }
    let out = rows;
    if (op.inCol) out = out.filter((r) => (op.inVals as unknown[]).includes((r as Record<string, unknown>)[op.inCol as string]));
    return { data: out.map((r) => ({ id: r.id, isin: r.isin, nse_symbol: r.nse_symbol })), error: null };
  }
  return { from: vi.fn(() => builder()), _rows: rows };
}

// --- userSupabase mock (companies / import_holdings / rpc) ------------------
type Op = {
  insert?: unknown; update?: unknown; select?: unknown; single?: boolean;
  eq?: Array<[string, unknown]>; in?: [string, unknown[]];
};
type Resolver = (op: Op) => { data?: unknown; error?: unknown };

function makeBuilder(resolver: Resolver) {
  const op: Op = {};
  const b: Record<string, unknown> = {
    select(c: unknown) { op.select = c; return b; },
    insert(v: unknown) { op.insert = v; return b; },
    update(v: unknown) { op.update = v; return b; },
    eq(col: string, val: unknown) { (op.eq ??= []).push([col, val]); return b; },
    in(col: string, vals: unknown[]) { op.in = [col, vals]; return b; },
    single() { op.single = true; return Promise.resolve(resolver(op)); },
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) { return Promise.resolve(resolver(op)).then(onF, onR); },
  };
  return b;
}

function setup(opts: {
  existingStocks?: StockRow[];
  existingCompanies?: Array<{ id: string; stock_id: string }>;
  rpcError?: string;
  companyInsertError?: string;
  raceExisting?: { id: string } | null;
  finalizeError?: string;
  stockCreateFails?: boolean;
} = {}) {
  mockAdminClient = makeAdminClient(opts.existingStocks ?? [], opts.stockCreateFails);

  const captured = {
    insertedHoldings: [] as unknown[],
    importUpdate: null as Record<string, unknown> | null,
    companyInserts: [] as unknown[],
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  };
  let companySeq = 0;

  const handlers: Record<string, Resolver> = {
    companies: (op) => {
      if (op.insert) {
        captured.companyInserts.push(op.insert);
        if (opts.companyInsertError) return { data: null, error: { message: opts.companyInsertError } };
        const inserts = (Array.isArray(op.insert) ? op.insert : [op.insert]) as Array<{ stock_id: string }>;
        const created = inserts.map((row) => { companySeq += 1; return { id: `company-${companySeq}`, stock_id: row.stock_id }; });
        return { data: Array.isArray(op.insert) ? created : created[0], error: null };
      }
      if (op.single) return { data: opts.raceExisting ?? null, error: null };
      // listing: select("id, stock_id").eq(portfolio).in("stock_id", [...])
      const requested = (op.in?.[1] as string[]) ?? [];
      return { data: (opts.existingCompanies ?? []).filter((c) => requested.includes(c.stock_id)) };
    },
    import_holdings: (op) => {
      if (op.update) captured.importUpdate = op.update as Record<string, unknown>;
      return { data: null, error: opts.finalizeError ? { message: opts.finalizeError } : null };
    },
  };

  const userSupabase = {
    from: vi.fn((table: string) => makeBuilder((op) => handlers[table]?.(op) ?? { data: null, error: null })),
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      captured.rpcCalls.push({ fn, args });
      if (fn === "replace_account_holdings") {
        captured.insertedHoldings = (args.p_rows as unknown[]) ?? [];
        return Promise.resolve({ error: opts.rpcError ? { message: opts.rpcError } : null });
      }
      return Promise.resolve({ data: null, error: null });
    }),
  };

  return { userSupabase, captured };
}

// --- fixtures -------------------------------------------------------------
function makeHolding(overrides: Partial<ParsedHolding> = {}): ParsedHolding {
  return { symbol: "RELIANCE", isin: "INE002A01018", sector: "Energy", quantity: 10, avg_price: 2500, ...overrides };
}
function makeParseResult(holdings: ParsedHolding[] = [makeHolding()], errors: HoldingsParseResult["errors"] = []): HoldingsParseResult {
  return { holdings, metadata: { broker: "zerodha", client_id: "AB1234", account_label: "AB1234 (Zerodha)", statement_date: "2025-03-31" }, errors };
}
const ARGS = { userId: "user-1", portfolioId: "portfolio-1", accountId: "account-1", accountLabel: "AB1234 (Zerodha)", importHoldingId: "import-1" };
function run(parseResult: HoldingsParseResult, userSupabase: unknown, isReimport = false) {
  return executeHoldingsImport(ARGS.userId, ARGS.portfolioId, ARGS.accountId, ARGS.accountLabel, ARGS.importHoldingId, parseResult, isReimport, userSupabase);
}

describe("executeHoldingsImport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("imports a holding when its stock and company already exist (matched by stock_id)", async () => {
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [{ id: "company-1", stock_id: "stock-1" }],
    });
    const result = await run(makeParseResult(), userSupabase);

    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(1);
    expect(result.new_companies_created).toEqual([]);
    expect(result.migrated_companies).toEqual([]);
    expect(captured.companyInserts).toHaveLength(0);
    expect(captured.insertedHoldings[0]).toMatchObject({
      company_id: "company-1", stock_id: "stock-1", isin: "INE002A01018", quantity: 10, avg_buy_price: 2500, source: "zerodha",
    });
  });

  it("auto-creates a missing stock and a missing company", async () => {
    const { userSupabase, captured } = setup({ existingStocks: [], existingCompanies: [] });
    const result = await run(makeParseResult(), userSupabase);

    expect(mockAdminClient._rows.some((s) => s.isin === "INE002A01018")).toBe(true); // stock created
    expect(captured.companyInserts).toHaveLength(1);
    expect(result.new_companies_created).toEqual(["RELIANCE"]);
    expect(result.imported_count).toBe(1);
    expect(captured.insertedHoldings[0]).toMatchObject({ company_id: "company-1" });
  });

  it("reuses the existing company across a split (ISIN change) instead of forking it", async () => {
    // Catalog has TD Power under its prior ISIN; statement reports the new ISIN.
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-td", isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }],
      existingCompanies: [{ id: "company-td", stock_id: "stock-td" }],
    });
    const result = await run(
      makeParseResult([makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035", quantity: 2800, avg_price: 264.5 })]),
      userSupabase, true
    );

    expect(captured.companyInserts).toHaveLength(0); // no duplicate company
    expect(mockAdminClient._rows.filter((s) => s.nse_symbol === "TDPOWERSYS")).toHaveLength(1); // no duplicate stock
    expect(result.new_companies_created).toEqual([]);
    expect(result.migrated_companies).toEqual(["TDPOWERSYS"]);
    expect(captured.insertedHoldings[0]).toMatchObject({
      company_id: "company-td", stock_id: "stock-td", isin: "INE419M01027", quantity: 2800,
    });
  });

  it("replaces holdings atomically via the replace_account_holdings RPC", async () => {
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [{ id: "company-1", stock_id: "stock-1" }],
    });
    await run(makeParseResult(), userSupabase);

    expect(captured.rpcCalls).toHaveLength(1);
    expect(captured.rpcCalls[0].fn).toBe("replace_account_holdings");
    expect(captured.rpcCalls[0].args).toMatchObject({ p_portfolio_id: "portfolio-1", p_account_id: "account-1" });
    expect(captured.rpcCalls[0].args.p_rows).toHaveLength(1);
  });

  it("throws when the atomic replace fails", async () => {
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [{ id: "company-1", stock_id: "stock-1" }],
      rpcError: "replace boom",
    });
    await expect(run(makeParseResult(), userSupabase)).rejects.toThrow(/replace boom/);
    expect(captured.rpcCalls).toHaveLength(1);
  });

  it("records the import_holdings summary (including migrated_companies) on completion", async () => {
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [{ id: "company-1", stock_id: "stock-1" }],
    });
    await run(makeParseResult(), userSupabase, true);

    expect(captured.importUpdate).toMatchObject({ status: "completed", is_reimport: true, imported_count: 1, companies_count: 1 });
    const summary = captured.importUpdate!.summary as Record<string, unknown>;
    expect(summary.symbols_imported).toEqual(["RELIANCE"]);
    expect(summary.migrated_companies).toEqual([]);
    expect(summary.statement_date).toBe("2025-03-31");
  });

  it("recovers a company id via race re-read when the insert conflicts", async () => {
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [],
      companyInsertError: "duplicate key",
      raceExisting: { id: "raced-company" },
    });
    const result = await run(makeParseResult(), userSupabase);

    expect(result.imported_count).toBe(1);
    expect(result.new_companies_created).toEqual([]);
    expect(captured.insertedHoldings[0]).toMatchObject({ company_id: "raced-company" });
  });

  it("surfaces parse errors and marks an all-error import as failed (no replace)", async () => {
    const { userSupabase, captured } = setup({ existingStocks: [], existingCompanies: [] });
    const result = await run(
      makeParseResult([], [
        { message: "No equity holdings found in the statement.", severity: "error" },
        { message: "Skipping non-equity row", severity: "warning" },
      ]),
      userSupabase
    );
    expect(result.status).toBe("failed");
    expect(result.imported_count).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(captured.rpcCalls).toHaveLength(0);
  });

  it("skips a holding whose stock cannot be resolved/created and does not wipe the account", async () => {
    const { userSupabase, captured } = setup({ existingStocks: [], existingCompanies: [], stockCreateFails: true });
    const result = await run(makeParseResult(), userSupabase);

    expect(result.status).toBe("failed");
    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(1);
    expect(result.errors.some((e) => /Could not register stock/.test(e.message))).toBe(true);
    expect(captured.rpcCalls).toHaveLength(0); // never replaced/wiped
  });

  it("records an error when a company cannot be created and the race re-read finds nothing", async () => {
    const { userSupabase, captured } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [],
      companyInsertError: "cannot create company",
      raceExisting: null,
    });
    const result = await run(makeParseResult(), userSupabase);

    expect(result.status).toBe("failed");
    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(1);
    expect(captured.rpcCalls).toHaveLength(0);
  });

  it("still reports success when finalizing the import_holdings record fails", async () => {
    const { userSupabase } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [{ id: "company-1", stock_id: "stock-1" }],
      finalizeError: "update timed out",
    });
    const result = await run(makeParseResult(), userSupabase);
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(1);
  });

  it("batches company creation into a single insert for multiple new stocks", async () => {
    const { userSupabase, captured } = setup({ existingStocks: [], existingCompanies: [] });
    const result = await run(
      makeParseResult([
        makeHolding({ symbol: "RELIANCE", isin: "INE002A01018" }),
        makeHolding({ symbol: "INFY", isin: "INE009A01021" }),
      ]),
      userSupabase
    );
    expect(captured.companyInserts).toHaveLength(1); // one bulk insert
    expect(captured.companyInserts[0]).toHaveLength(2);
    expect(result.new_companies_created).toEqual(expect.arrayContaining(["RELIANCE", "INFY"]));
    expect(result.imported_count).toBe(2);
    expect(captured.insertedHoldings).toHaveLength(2);
  });

  it("propagates the is_reimport flag and statement metadata", async () => {
    const { userSupabase } = setup({
      existingStocks: [{ id: "stock-1", isin: "INE002A01018", nse_symbol: "RELIANCE" }],
      existingCompanies: [{ id: "company-1", stock_id: "stock-1" }],
    });
    const result = await run(makeParseResult(), userSupabase, true);
    expect(result.is_reimport).toBe(true);
    expect(result.account_label).toBe("AB1234 (Zerodha)");
    expect(result.statement_date).toBe("2025-03-31");
    expect(result.client_id).toBe("AB1234");
  });
});
