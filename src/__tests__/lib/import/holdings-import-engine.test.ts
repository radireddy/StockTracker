import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HoldingsParseResult, ParsedHolding } from "@/lib/import/types";

// --- module mocks --------------------------------------------------------
let mockAdminClient: MockClient;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }),
}));

import { executeHoldingsImport } from "@/lib/import/holdings-import-engine";

// --- a tiny chainable-thenable Supabase query builder mock ----------------
type Op = {
  select?: unknown;
  insert?: unknown;
  upsert?: unknown;
  upsertOpts?: unknown;
  update?: unknown;
  delete?: boolean;
  single?: boolean;
  eq?: Array<[string, unknown]>;
  in?: [string, unknown[]];
};
type Resolver = (op: Op) => { data?: unknown; error?: unknown };
type RpcResolver = (fn: string, args: Record<string, unknown>) => { data?: unknown; error?: unknown };
type MockClient = { from: (table: string) => unknown; rpc?: (fn: string, args: Record<string, unknown>) => Promise<unknown> };

function makeBuilder(resolver: Resolver) {
  const op: Op = {};
  const builder: Record<string, unknown> = {
    select(cols: unknown) { op.select = cols; return builder; },
    insert(vals: unknown) { op.insert = vals; return builder; },
    upsert(vals: unknown, opts: unknown) { op.upsert = vals; op.upsertOpts = opts; return builder; },
    update(vals: unknown) { op.update = vals; return builder; },
    delete() { op.delete = true; return builder; },
    eq(col: string, val: unknown) { (op.eq ??= []).push([col, val]); return builder; },
    in(col: string, vals: unknown[]) { op.in = [col, vals]; return builder; },
    single() { op.single = true; return Promise.resolve(resolver(op)); },
    then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      return Promise.resolve(resolver(op)).then(onF, onR);
    },
  };
  return builder;
}

function makeClient(handlers: Record<string, Resolver>, rpcResolver?: RpcResolver): MockClient {
  return {
    from: vi.fn((table: string) =>
      makeBuilder((op) => handlers[table]?.(op) ?? { data: null, error: null })
    ),
    rpc: vi.fn((fn: string, args: Record<string, unknown>) =>
      Promise.resolve(rpcResolver?.(fn, args) ?? { data: null, error: null })
    ),
  };
}

// --- fixtures -------------------------------------------------------------
function makeHolding(overrides: Partial<ParsedHolding> = {}): ParsedHolding {
  return {
    symbol: "RELIANCE",
    isin: "INE002A01018",
    sector: "Energy",
    quantity: 10,
    avg_price: 2500,
    ...overrides,
  };
}

function makeParseResult(
  holdings: ParsedHolding[] = [makeHolding()],
  errors: HoldingsParseResult["errors"] = []
): HoldingsParseResult {
  return {
    holdings,
    metadata: {
      broker: "zerodha",
      client_id: "AB1234",
      account_label: "AB1234 (Zerodha)",
      statement_date: "2025-03-31",
    },
    errors,
  };
}

/**
 * Build a userSupabase mock plus the capture bag used for assertions.
 * `opts` lets each test steer which stocks/companies pre-exist and force errors.
 */
function setup(opts: {
  existingStockIsins?: string[];
  existingCompanies?: Array<{ id: string; isin: string }>;
  aliasStocks?: Array<{ isin: string; nse_symbol: string | null }>;
  priorCompanies?: Array<{ id: string; isin: string }>;
  migrateError?: string;
  rpcError?: string;
  stockUpsertError?: string;
  companyInsertError?: string;
  raceExisting?: { id: string } | null;
  finalizeError?: string;
} = {}) {
  const captured: {
    insertedHoldings: unknown[];
    importUpdate: Record<string, unknown> | null;
    companyInserts: unknown[];
    companyUpdates: Array<{ update: unknown; eq?: Array<[string, unknown]> }>;
    stockUpserts: unknown[];
    rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  } = { insertedHoldings: [], importUpdate: null, companyInserts: [], companyUpdates: [], stockUpserts: [], rpcCalls: [] };

  const knownStocks = new Set(opts.existingStockIsins ?? []);
  let companySeq = 0;

  mockAdminClient = makeClient({
    indian_stocks: (op) => {
      if (op.upsert) {
        captured.stockUpserts.push(op.upsert);
        return { error: opts.stockUpsertError ? { message: opts.stockUpsertError } : null };
      }
      // ISIN-change reconciliation: select .in("nse_symbol", symbols) → prior stocks.
      if (op.in?.[0] === "nse_symbol") {
        const syms = (op.in[1] as string[]) ?? [];
        return { data: (opts.aliasStocks ?? []).filter((s) => s.nse_symbol && syms.includes(s.nse_symbol)) };
      }
      // select .in("isin", isins)
      const requested = (op.in?.[1] as string[]) ?? [];
      return { data: requested.filter((i) => knownStocks.has(i)).map((isin) => ({ isin })) };
    },
  });

  const userSupabase = makeClient(
    {
      companies: (op) => {
        if (op.insert) {
          captured.companyInserts.push(op.insert);
          if (opts.companyInsertError) return { data: null, error: { message: opts.companyInsertError } };
          // Real Supabase: `.insert([...]).select()` → array of rows;
          // `.insert({...}).select().single()` → one row. Mirror both so the
          // bulk path and the per-row fallback both work against this mock.
          const inserts = (Array.isArray(op.insert) ? op.insert : [op.insert]) as Array<{ isin: string }>;
          const created = inserts.map((row) => {
            companySeq += 1;
            return { id: `new-company-${companySeq}`, isin: row.isin };
          });
          return { data: Array.isArray(op.insert) ? created : created[0], error: null };
        }
        if (op.update) {
          // ISIN migration (best-effort) during ISIN-change reconciliation.
          captured.companyUpdates.push({ update: op.update, eq: op.eq });
          return { data: null, error: opts.migrateError ? { message: opts.migrateError } : null };
        }
        if (op.single) {
          // race re-read after an insert conflict
          return { data: opts.raceExisting ?? null, error: null };
        }
        // Listing: select("id, isin").eq(...).in("isin", ...). The initial pass
        // requests the statement's ISINs; the reconciliation pass requests prior
        // (alias) ISINs. Filter a combined pool by exactly what was asked for.
        const requested = (op.in?.[1] as string[]) ?? [];
        const pool = [...(opts.existingCompanies ?? []), ...(opts.priorCompanies ?? [])];
        return { data: pool.filter((c) => requested.includes(c.isin)) };
      },
      import_holdings: (op) => {
        if (op.update) captured.importUpdate = op.update as Record<string, unknown>;
        return { data: null, error: opts.finalizeError ? { message: opts.finalizeError } : null };
      },
    },
    (fn, args) => {
      captured.rpcCalls.push({ fn, args });
      if (fn === "replace_account_holdings") {
        captured.insertedHoldings = (args.p_rows as unknown[]) ?? [];
        return { error: opts.rpcError ? { message: opts.rpcError } : null };
      }
      return { data: null, error: null };
    }
  );

  return { userSupabase, captured };
}

const ARGS = {
  userId: "user-1",
  portfolioId: "portfolio-1",
  accountId: "account-1",
  accountLabel: "AB1234 (Zerodha)",
  importHoldingId: "import-1",
};

function run(parseResult: HoldingsParseResult, userSupabase: unknown, isReimport = false) {
  return executeHoldingsImport(
    ARGS.userId,
    ARGS.portfolioId,
    ARGS.accountId,
    ARGS.accountLabel,
    ARGS.importHoldingId,
    parseResult,
    isReimport,
    userSupabase
  );
}

describe("executeHoldingsImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("imports a holding when its stock and company already exist", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
    });

    const result = await run(makeParseResult(), userSupabase);

    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(1);
    expect(result.companies_count).toBe(1);
    expect(result.skipped_count).toBe(0);
    expect(result.new_companies_created).toEqual([]);
    expect(result.symbols_imported).toEqual(["RELIANCE"]);
    expect(captured.stockUpserts).toHaveLength(0); // stock already known
    expect(captured.companyInserts).toHaveLength(0); // company already known
    expect(captured.insertedHoldings).toHaveLength(1);
    expect(captured.insertedHoldings[0]).toMatchObject({
      company_id: "company-1",
      isin: "INE002A01018",
      quantity: 10,
      avg_buy_price: 2500,
      source: "zerodha",
      import_holding_id: "import-1",
      account_id: "account-1",
    });
  });

  it("auto-creates a missing stock and a missing company", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: [], // stock missing → must be upserted
      existingCompanies: [], // company missing → must be created
    });

    const result = await run(makeParseResult(), userSupabase);

    expect(captured.stockUpserts).toHaveLength(1);
    expect(captured.companyInserts).toHaveLength(1);
    expect(result.new_companies_created).toEqual(["RELIANCE"]);
    expect(result.imported_count).toBe(1);
    expect(captured.insertedHoldings[0]).toMatchObject({ company_id: "new-company-1" });
  });

  it("records the import_holdings summary on completion", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
    });

    await run(makeParseResult(), userSupabase, true);

    expect(captured.importUpdate).toBeTruthy();
    expect(captured.importUpdate).toMatchObject({
      status: "completed",
      is_reimport: true,
      imported_count: 1,
      companies_count: 1,
    });
    const summary = captured.importUpdate!.summary as Record<string, unknown>;
    expect(summary.statement_date).toBe("2025-03-31");
    expect(summary.client_id).toBe("AB1234");
    expect(summary.symbols_imported).toEqual(["RELIANCE"]);
  });

  it("still reports success when finalizing the import_holdings record fails", async () => {
    // The holdings are already committed by the RPC (step 4), so a failure while
    // writing the history row must not turn a successful import into a failure —
    // it is logged and swallowed.
    const { userSupabase } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
      finalizeError: "update timed out",
    });

    const result = await run(makeParseResult(), userSupabase);

    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(1);
  });

  it("propagates the is_reimport flag and statement metadata into the result", async () => {
    const { userSupabase } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
    });

    const result = await run(makeParseResult(), userSupabase, true);

    expect(result.is_reimport).toBe(true);
    expect(result.account_id).toBe("account-1");
    expect(result.account_label).toBe("AB1234 (Zerodha)");
    expect(result.statement_date).toBe("2025-03-31");
    expect(result.client_id).toBe("AB1234");
  });

  it("surfaces parse errors (severity=error) and marks an all-error import as failed", async () => {
    const { userSupabase, captured } = setup({ existingStockIsins: [], existingCompanies: [] });

    const parseResult = makeParseResult([], [
      { message: "No equity holdings found in the statement.", severity: "error" },
      { message: "Skipping non-equity row", severity: "warning" }, // must NOT surface
    ]);
    const result = await run(parseResult, userSupabase);

    expect(result.status).toBe("failed");
    expect(result.imported_count).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/No equity holdings/);
    expect(captured.insertedHoldings).toHaveLength(0);
  });

  it("replaces holdings atomically via the replace_account_holdings RPC", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
    });

    await run(makeParseResult(), userSupabase);

    expect(captured.rpcCalls).toHaveLength(1);
    expect(captured.rpcCalls[0].fn).toBe("replace_account_holdings");
    expect(captured.rpcCalls[0].args).toMatchObject({
      p_portfolio_id: "portfolio-1",
      p_account_id: "account-1",
    });
    expect(captured.rpcCalls[0].args.p_rows).toHaveLength(1);
  });

  it("throws when the atomic replace fails (transaction rolls back, existing holdings untouched)", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
      rpcError: "replace boom",
    });

    await expect(run(makeParseResult(), userSupabase)).rejects.toThrow(/replace boom/);
    expect(captured.rpcCalls).toHaveLength(1);
  });

  it("skips the destructive replace when no rows would be inserted (preserves existing holdings)", async () => {
    // Stock exists but the company can't be created → the only holding is skipped → 0 rows.
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [],
      companyInsertError: "cannot create company",
      raceExisting: null,
    });

    const result = await run(makeParseResult(), userSupabase);

    expect(captured.rpcCalls).toHaveLength(0); // never wiped the account
    expect(result.status).toBe("failed");
    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(1);
  });

  it("recovers a company id via race re-read when the insert conflicts", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [],
      companyInsertError: "duplicate key",
      raceExisting: { id: "raced-company" },
    });

    const result = await run(makeParseResult(), userSupabase);

    expect(result.imported_count).toBe(1);
    expect(result.new_companies_created).toEqual([]); // it existed, we didn't create it
    expect(captured.insertedHoldings[0]).toMatchObject({ company_id: "raced-company" });
  });

  it("records an error and skips the holding when the stock cannot be registered", async () => {
    // Both the initial upsert and the fallback retry fail → the ISIN is never
    // registered, so its holding is skipped.
    const { userSupabase, captured } = setup({
      existingStockIsins: [], // stock missing → upsert attempted (and it fails)
      existingCompanies: [],
      stockUpsertError: "permission denied for table indian_stocks",
    });

    const result = await run(makeParseResult(), userSupabase);

    expect(captured.stockUpserts.length).toBeGreaterThanOrEqual(2); // initial + retry
    expect(captured.companyInserts).toHaveLength(0); // never got to company creation
    expect(captured.rpcCalls).toHaveLength(0); // nothing to replace
    expect(result.status).toBe("failed");
    expect(result.skipped_count).toBe(1);
    expect(result.errors.some((e) => /Could not register stock/.test(e.message))).toBe(true);
  });

  it("batches company creation into a single insert for multiple new companies", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018", "INE009A01021"], // stocks known
      existingCompanies: [], // both companies missing
    });

    const result = await run(
      makeParseResult([
        makeHolding({ symbol: "RELIANCE", isin: "INE002A01018" }),
        makeHolding({ symbol: "INFY", isin: "INE009A01021" }),
      ]),
      userSupabase
    );

    expect(captured.companyInserts).toHaveLength(1); // one bulk call, not one per company
    expect(captured.companyInserts[0]).toHaveLength(2); // both rows in the single call
    expect(result.new_companies_created).toEqual(expect.arrayContaining(["RELIANCE", "INFY"]));
    expect(result.imported_count).toBe(2);
    expect(captured.insertedHoldings).toHaveLength(2);
  });

  it("batches stock registration into a single upsert for multiple new stocks", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: [], // both stocks missing
      existingCompanies: [],
    });

    await run(
      makeParseResult([
        makeHolding({ symbol: "RELIANCE", isin: "INE002A01018" }),
        makeHolding({ symbol: "INFY", isin: "INE009A01021" }),
      ]),
      userSupabase
    );

    expect(captured.stockUpserts).toHaveLength(1); // one bulk upsert, not one per stock
    expect(captured.stockUpserts[0]).toHaveLength(2); // both stocks in the single call
  });

  it("reuses the existing company when a stock's ISIN changed (split/corporate action) instead of forking it", async () => {
    // Statement reports TD Power under its post-split ISIN. The existing company
    // (research + holdings) lives under the prior ISIN; matched by NSE symbol it
    // must be reused and migrated, NOT duplicated.
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE419M01035"], // new ISIN already registered
      existingCompanies: [], // no company under the NEW ISIN
      aliasStocks: [{ isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }], // prior ISIN, same symbol
      priorCompanies: [{ id: "td-company", isin: "INE419M01027" }], // existing company on prior ISIN
    });

    const result = await run(
      makeParseResult([
        makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035", quantity: 2800, avg_price: 264.5 }),
      ]),
      userSupabase,
      true
    );

    expect(captured.companyInserts).toHaveLength(0); // did NOT create a duplicate stub
    expect(result.new_companies_created).toEqual([]);
    expect(result.migrated_companies).toEqual(["TDPOWERSYS"]);
    expect(result.imported_count).toBe(1);
    expect(captured.insertedHoldings).toHaveLength(1);
    expect(captured.insertedHoldings[0]).toMatchObject({
      company_id: "td-company",
      isin: "INE419M01035",
      quantity: 2800,
    });
    // The company row is migrated to the current ISIN so later imports match directly.
    expect(captured.companyUpdates).toEqual([
      expect.objectContaining({ update: { isin: "INE419M01035" } }),
    ]);
  });

  it("creates a new company when no prior ISIN matches by symbol (no over-matching)", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE419M01035"],
      existingCompanies: [],
      aliasStocks: [], // symbol is not registered under any prior ISIN
    });

    const result = await run(
      makeParseResult([makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035" })]),
      userSupabase
    );

    expect(captured.companyInserts).toHaveLength(1);
    expect(captured.companyUpdates).toHaveLength(0);
    expect(result.new_companies_created).toEqual(["TDPOWERSYS"]);
    expect(result.migrated_companies).toEqual([]);
  });

  it("still reuses the company when the best-effort ISIN re-key update fails", async () => {
    // The migrate UPDATE is best-effort: even if it errors, the holding must
    // still attach to the existing company (via companyMap), not a duplicate.
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE419M01035"],
      existingCompanies: [],
      aliasStocks: [{ isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }],
      priorCompanies: [{ id: "td-company", isin: "INE419M01027" }],
      migrateError: "row is being updated by another transaction",
    });

    const result = await run(
      makeParseResult([makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035" })]),
      userSupabase
    );

    expect(captured.companyInserts).toHaveLength(0);
    expect(captured.companyUpdates).toHaveLength(1); // attempted the re-key
    expect(result.migrated_companies).toEqual(["TDPOWERSYS"]);
    expect(captured.insertedHoldings[0]).toMatchObject({ company_id: "td-company" });
  });

  it("ignores alias stocks with a null NSE symbol and dedups multiple prior ISINs", async () => {
    // The new ISIN's own stock row carries a null nse_symbol (partial unique
    // index) and must be skipped; multiple prior ISINs for one symbol accumulate.
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE419M01035"],
      existingCompanies: [],
      aliasStocks: [
        { isin: "INE419M01035", nse_symbol: null }, // the new ISIN itself → skip
        { isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }, // prior ISIN
        { isin: "INE419M01019", nse_symbol: "TDPOWERSYS" }, // an even older ISIN
      ],
      priorCompanies: [{ id: "td-company", isin: "INE419M01027" }],
    });

    const result = await run(
      makeParseResult([makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035" })]),
      userSupabase
    );

    expect(captured.companyInserts).toHaveLength(0);
    expect(result.migrated_companies).toEqual(["TDPOWERSYS"]);
    expect(captured.insertedHoldings[0]).toMatchObject({ company_id: "td-company" });
  });

  it("matches only the changed stock and still creates genuinely new ones in the same batch", async () => {
    // One row is a post-split ISIN of a held stock (reuse); another is brand new
    // (create). Exercises the per-row match/no-match branches together.
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE419M01035", "INE009A01021"],
      existingCompanies: [],
      aliasStocks: [{ isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }],
      priorCompanies: [{ id: "td-company", isin: "INE419M01027" }],
    });

    const result = await run(
      makeParseResult([
        makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035" }),
        makeHolding({ symbol: "INFY", isin: "INE009A01021" }),
      ]),
      userSupabase
    );

    expect(result.migrated_companies).toEqual(["TDPOWERSYS"]);
    expect(result.new_companies_created).toEqual(["INFY"]);
    expect(captured.companyInserts).toHaveLength(1); // only INFY created
    expect(result.imported_count).toBe(2);
  });

  it("creates a new company when the symbol is known but not held in this portfolio", async () => {
    // A prior ISIN exists for the symbol, but the user has no company for it in
    // this portfolio → there is nothing to reuse, so create fresh (don't migrate).
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE419M01035"],
      existingCompanies: [],
      aliasStocks: [{ isin: "INE419M01027", nse_symbol: "TDPOWERSYS" }],
      priorCompanies: [], // no company under the prior ISIN in this portfolio
    });

    const result = await run(
      makeParseResult([makeHolding({ symbol: "TDPOWERSYS", isin: "INE419M01035" })]),
      userSupabase
    );

    expect(captured.companyInserts).toHaveLength(1);
    expect(captured.companyUpdates).toHaveLength(0);
    expect(result.new_companies_created).toEqual(["TDPOWERSYS"]);
    expect(result.migrated_companies).toEqual([]);
  });

  it("consolidates unique ISINs across duplicate rows", async () => {
    const { userSupabase, captured } = setup({
      existingStockIsins: ["INE002A01018", "INE009A01021"],
      existingCompanies: [
        { id: "company-1", isin: "INE002A01018" },
        { id: "company-2", isin: "INE009A01021" },
      ],
    });

    const result = await run(
      makeParseResult([
        makeHolding({ symbol: "RELIANCE", isin: "INE002A01018", quantity: 10 }),
        makeHolding({ symbol: "INFY", isin: "INE009A01021", quantity: 5, avg_price: 1500 }),
      ]),
      userSupabase
    );

    expect(result.imported_count).toBe(2);
    expect(result.companies_count).toBe(2);
    expect(captured.insertedHoldings).toHaveLength(2);
  });
});
