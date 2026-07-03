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
      client_id: "YY7859",
      account_label: "YY7859 (Zerodha)",
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
    stockUpserts: unknown[];
    rpcCalls: Array<{ fn: string; args: Record<string, unknown> }>;
  } = { insertedHoldings: [], importUpdate: null, companyInserts: [], stockUpserts: [], rpcCalls: [] };

  const knownStocks = new Set(opts.existingStockIsins ?? []);
  let companySeq = 0;

  mockAdminClient = makeClient({
    indian_stocks: (op) => {
      if (op.upsert) {
        captured.stockUpserts.push(op.upsert);
        return { error: opts.stockUpsertError ? { message: opts.stockUpsertError } : null };
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
          companySeq += 1;
          return { data: { id: `new-company-${companySeq}` }, error: null };
        }
        if (op.single) {
          // race re-read after an insert conflict
          return { data: opts.raceExisting ?? null, error: null };
        }
        // initial listing: select("id, isin").eq(...).in("isin", ...)
        return { data: opts.existingCompanies ?? [] };
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
  accountLabel: "YY7859 (Zerodha)",
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
    expect(summary.client_id).toBe("YY7859");
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
    expect(result.account_label).toBe("YY7859 (Zerodha)");
    expect(result.statement_date).toBe("2025-03-31");
    expect(result.client_id).toBe("YY7859");
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
