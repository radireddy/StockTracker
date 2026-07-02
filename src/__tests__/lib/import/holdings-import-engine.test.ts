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
type MockClient = { from: (table: string) => unknown };

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

function makeClient(handlers: Record<string, Resolver>): MockClient {
  return {
    from: vi.fn((table: string) =>
      makeBuilder((op) => handlers[table]?.(op) ?? { data: null, error: null })
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
  deleteError?: string;
  upsertError?: string;
  stockUpsertError?: string;
  companyInsertError?: string;
  raceExisting?: { id: string } | null;
} = {}) {
  const captured: {
    insertedHoldings: unknown[];
    importUpdate: Record<string, unknown> | null;
    companyInserts: unknown[];
    stockUpserts: unknown[];
  } = { insertedHoldings: [], importUpdate: null, companyInserts: [], stockUpserts: [] };

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

  const userSupabase = makeClient({
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
    holdings: (op) => {
      if (op.delete) return { error: opts.deleteError ? { message: opts.deleteError } : null };
      if (op.upsert) {
        captured.insertedHoldings = op.upsert as unknown[];
        return { error: opts.upsertError ? { message: opts.upsertError } : null };
      }
      return { data: null, error: null };
    },
    import_holdings: (op) => {
      if (op.update) captured.importUpdate = op.update as Record<string, unknown>;
      return { data: null, error: null };
    },
  });

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

  it("throws when clearing previous holdings fails", async () => {
    const { userSupabase } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
      deleteError: "delete boom",
    });

    await expect(run(makeParseResult(), userSupabase)).rejects.toThrow(/delete boom/);
  });

  it("throws when inserting the fresh snapshot fails", async () => {
    const { userSupabase } = setup({
      existingStockIsins: ["INE002A01018"],
      existingCompanies: [{ id: "company-1", isin: "INE002A01018" }],
      upsertError: "insert boom",
    });

    await expect(run(makeParseResult(), userSupabase)).rejects.toThrow(/insert boom/);
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
