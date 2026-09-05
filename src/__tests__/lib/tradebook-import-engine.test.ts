import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TradebookParseResult } from "@/lib/import/tradebook-types";

// ── Supabase mock ─────────────────────────────────────────────────────────────

const _db: Record<string, Record<string, unknown>[]> = {
  import_tradebooks: [],
  trades: [],
  trade_lot_matches: [],
  corporate_action_ref: [],
  corporate_actions: [],
  holdings: [],
  indian_stocks: [],
  open_position_snapshots: [],
};
const _inserted: Record<string, unknown[]> = {};

function resetDb() {
  for (const k of Object.keys(_db)) _db[k] = [];
  for (const k of Object.keys(_inserted)) delete _inserted[k];
  // Always ensure these tables exist (may be referenced by CA detection)
  _db.corporate_action_ref = [];
  _db.corporate_actions = [];
  _db.holdings = [];
  _db.indian_stocks = [];
  _db.open_position_snapshots = [];
}

/** Minimal Supabase client mock used by the engine (admin path). */
function makeAdminMock() {
  return {
    from: (table: string) => {
      const tableData = () => _db[table] ?? [];
      return {
        // insert — records into _inserted and _db, returns the rows with mock ids
        insert: (rows: unknown) => {
          const arr = Array.isArray(rows) ? rows : [rows];
          const withIds = arr.map((r, i) => ({
            ...(r as object),
            id: `mock-${table}-${tableData().length + i}`,
          }));
          return {
            select: (cols?: string) => {
              if (cols === "id" || cols === "id, label") {
                _inserted[table] = [...(_inserted[table] ?? []), ...withIds];
                _db[table] = [..._db[table], ...withIds];
                return {
                  single: async () => ({ data: withIds[0], error: null }),
                };
              }
              _inserted[table] = [...(_inserted[table] ?? []), ...withIds];
              _db[table] = [..._db[table], ...withIds];
              return { data: withIds, error: null };
            },
          };
        },
        // upsert — handles both trades (conflict on broker_trade_id) and
        // corporate_actions (conflict on stock_id,action_type,ex_date).
        upsert: (rows: unknown, opts?: { onConflict?: string }) => {
          const arr = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
          const onConflict = opts?.onConflict ?? "account_id,broker_trade_id";
          let fresh: Record<string, unknown>[];
          if (onConflict === "stock_id,action_type,ex_date") {
            // corporate_actions upsert: replace-or-insert by (stock_id, action_type, ex_date)
            const existingKeys = new Set(
              tableData().map((r) => {
                const row = r as Record<string, unknown>;
                return `${row.stock_id}||${row.action_type}||${row.ex_date}`;
              })
            );
            // Remove any stale matching rows, then add new ones
            _db[table] = _db[table].filter((r) => {
              const row = r as Record<string, unknown>;
              const key = `${row.stock_id}||${row.action_type}||${row.ex_date}`;
              return !arr.some((a) => `${a.stock_id}||${a.action_type}||${a.ex_date}` === key);
            });
            fresh = arr;
          } else {
            // trades upsert: ON CONFLICT DO NOTHING by (account_id, broker_trade_id)
            const existing = new Set(
              tableData().map((r) => `${(r as Record<string, unknown>).account_id}||${(r as Record<string, unknown>).broker_trade_id}`)
            );
            fresh = arr.filter(
              (r) => !existing.has(`${r.account_id}||${r.broker_trade_id}`)
            );
          }
          const withIds = fresh.map((r, i) => ({
            ...r,
            id: `${table}-${tableData().length + i}`,
          }));
          _db[table] = [..._db[table], ...withIds];
          _inserted[table] = [...(_inserted[table] ?? []), ...withIds];
          return {
            select: async () => ({ data: withIds, error: null }),
          };
        },
        // select — returns all rows for the table (simple, no real filtering).
        // Supports the paginated `.range(from, to)` used by the FIFO recompute,
        // and `.in().order().range()` used by loadRefBySymbols.
        select: (_cols?: string) => {
          const makeRangeable = (data: Record<string, unknown>[]) => ({
            order: (_c: string, _o?: unknown) => ({
              range: (from: number, to: number) =>
                Promise.resolve({ data: data.slice(from, to + 1), error: null }),
              then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                resolve({ data, error: null }),
            }),
            range: (from: number, to: number) =>
              Promise.resolve({ data: data.slice(from, to + 1), error: null }),
          });

          return {
            // eq — used by trades (account_id filter) and holdings (account_id filter)
            eq: (_col: string, _val: unknown) => {
              const filtered = tableData(); // simple mock: return all rows
              return {
                ...makeRangeable(filtered),
                // Support chaining: holdings.select().eq().then (direct await)
                then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                  resolve({ data: filtered, error: null }),
              };
            },
            // in — used by loadRefBySymbols and indian_stocks
            in: (_col: string, _vals: unknown[]) => {
              const filtered = tableData();
              return makeRangeable(filtered);
            },
            // not — used by loadCorporateActionContext for indian_stocks
            not: (_col: string, _op: string, _val: unknown) =>
              Promise.resolve({ data: tableData(), error: null }),
            order: makeRangeable(tableData()).order,
          };
        },
        // delete — removes rows for the account
        delete: () => ({
          eq: (_col: string, _val: unknown) => {
            _db[table] = [];
            return { error: null };
          },
        }),
        // update — used to finalize the import_tradebooks row
        update: (vals: unknown) => ({
          eq: (_col: string, _val: unknown) => {
            const [first] = _db[table];
            if (first) Object.assign(first, vals);
            return { error: null };
          },
        }),
      };
    },
    // select all trades for FIFO recompute
    rpc: (_name: string, _args?: unknown) => ({ data: [], error: null }),
  };
}

// Unused helper kept for reference — left out to avoid lint warnings
// function patchSelectAsync(...) { ... }

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => makeAdminMock(),
}));

vi.mock("@/lib/stocks/resolve-stock", () => ({
  resolveStocks: async (
    _client: unknown,
    refs: Array<{ isin: string; symbol: string }>
  ) => {
    const map = new Map<string, { stockId: string; currentIsin: string }>();
    for (const r of refs) {
      map.set(r.isin, { stockId: `stock-${r.isin}`, currentIsin: r.isin });
    }
    return map;
  },
}));

import { executeTradebookImport, recomputeFifoForAccount, detectAndApplyForAccount } from "@/lib/import/tradebook-import-engine";

/** Helper: recompute FIFO then detect+apply corporate actions for an account. */
async function recomputeAndDetect(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  userId: string,
  accountId: string
) {
  await recomputeFifoForAccount(admin, userId, accountId);
  return detectAndApplyForAccount(admin, userId, accountId);
}

function makeParsed(tradeCount: number, clientId = "XD6134"): TradebookParseResult {
  return {
    trades: Array.from({ length: tradeCount }, (_, i) => ({
      symbol: "GRAVITA",
      isin: "INE024L01027",
      trade_date: "2026-04-01",
      exchange: "NSE",
      segment: "EQ",
      series: "EQ",
      trade_type: "buy" as const,
      is_auction: false,
      quantity: 100,
      price: 1355,
      broker_trade_id: `TID-${i}`,
      broker_order_id: null,
      executed_at: null,
    })),
    metadata: {
      broker: "zerodha",
      client_id: clientId,
      account_label: `${clientId} (Zerodha)`,
      date_from: "2026-04-01",
      date_to: "2026-08-30",
    },
    errors: [],
  };
}

describe("executeTradebookImport", () => {
  beforeEach(() => resetDb());

  it("returns completed status and imported_count > 0 on first import", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = makeAdminMock() as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.mocked(await import("@/lib/supabase/admin")).createAdminClient as any) = () => admin;

    const result = await executeTradebookImport(
      "user-1",
      "acc-mock",
      "acc-mock-label",
      makeParsed(3),
      "tradebook.xlsx"
    );
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(3);
    expect(result.skipped_count).toBe(0);
    expect(result.account_id).toBe("acc-mock");
  });

  it("records the import in import_tradebooks", async () => {
    const result = await executeTradebookImport(
      "user-1",
      "acc-mock",
      "acc-mock-label",
      makeParsed(2),
      "my-file.xlsx"
    );
    const auditRows = _inserted["import_tradebooks"] ?? [];
    expect(auditRows.length).toBeGreaterThan(0);
    const audit = auditRows[0] as Record<string, unknown>;
    expect(audit.file_name).toBe("my-file.xlsx");
    expect(audit.broker).toBe("zerodha");
    expect(result.status).toBe("completed");
  });

  it("returns skipped_count = total on pure re-import (all trades already exist)", async () => {
    const parsed = makeParsed(3);
    // Pre-seed the DB with the same trades so the upsert returns 0 fresh rows
    for (let i = 0; i < 3; i++) {
      _db.trades.push({
        id: `existing-${i}`,
        account_id: "acc-mock",
        broker_trade_id: `TID-${i}`,
      });
    }
    const result = await executeTradebookImport(
      "user-1",
      "acc-mock",
      "acc-mock-label",
      parsed,
      "tradebook.xlsx"
    );
    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(3);
    // No lot matches should be inserted when nothing new
    const lotMatches = _inserted["trade_lot_matches"] ?? [];
    expect(lotMatches).toHaveLength(0);
  });

  it("sets total_rows and date_from/date_to from parse result", async () => {
    const result = await executeTradebookImport(
      "user-1",
      "acc-mock",
      "acc-mock-label",
      makeParsed(5),
      "file.xlsx"
    );
    expect(result.total_rows).toBe(5);
    expect(result.date_from).toBe("2026-04-01");
    expect(result.date_to).toBe("2026-08-30");
  });

  it("includes parse warnings in error_count when present", async () => {
    const parsed = makeParsed(2);
    parsed.errors.push({ severity: "warning", message: "Skipping FO row", symbol: "NIFTY" });
    const result = await executeTradebookImport(
      "user-1",
      "acc-mock",
      "acc-mock-label",
      parsed,
      "file.xlsx"
    );
    expect(result.error_count).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message === "Skipping FO row")).toBe(true);
  });

  it("triggers FIFO recompute and inserts lot_matches when buy+sell both present", async () => {
    const parsed: TradebookParseResult = {
      trades: [
        {
          symbol: "GRAVITA",
          isin: "INE024L01027",
          trade_date: "2026-04-01",
          exchange: "NSE",
          segment: "EQ",
          series: "EQ",
          trade_type: "buy",
          is_auction: false,
          quantity: 100,
          price: 1355,
          broker_trade_id: "BUY-1",
          broker_order_id: null,
          executed_at: null,
        },
        {
          symbol: "GRAVITA",
          isin: "INE024L01027",
          trade_date: "2026-08-01",
          exchange: "NSE",
          segment: "EQ",
          series: "EQ",
          trade_type: "sell",
          is_auction: false,
          quantity: 50,
          price: 1500,
          broker_trade_id: "SELL-1",
          broker_order_id: null,
          executed_at: null,
        },
      ],
      metadata: {
        broker: "zerodha",
        client_id: "XD6134",
        account_label: "XD6134 (Zerodha)",
        date_from: "2026-04-01",
        date_to: "2026-08-30",
      },
      errors: [],
    };

    const result = await executeTradebookImport(
      "user-1",
      "acc-mock",
      "acc-mock-label",
      parsed,
      "tradebook.xlsx"
    );
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(2);
    // FIFO should have produced 1 lot match (50 sell against 50 of the buy)
    const lotMatches = _inserted["trade_lot_matches"] ?? [];
    expect(lotMatches.length).toBeGreaterThan(0);
  });

  it("with { recompute: false } inserts trades but writes NO lot_matches (deferred to batch)", async () => {
    const parsed: TradebookParseResult = {
      trades: [
        {
          symbol: "GRAVITA", isin: "INE024L01027", trade_date: "2026-04-01",
          exchange: "NSE", segment: "EQ", series: "EQ", trade_type: "buy",
          is_auction: false, quantity: 100, price: 1355,
          broker_trade_id: "BUY-1", broker_order_id: null, executed_at: null,
        },
        {
          symbol: "GRAVITA", isin: "INE024L01027", trade_date: "2026-08-01",
          exchange: "NSE", segment: "EQ", series: "EQ", trade_type: "sell",
          is_auction: false, quantity: 50, price: 1500,
          broker_trade_id: "SELL-1", broker_order_id: null, executed_at: null,
        },
      ],
      metadata: {
        broker: "zerodha", client_id: "XD6134", account_label: "XD6134 (Zerodha)",
        date_from: "2026-04-01", date_to: "2026-08-30",
      },
      errors: [],
    };

    const result = await executeTradebookImport(
      "user-1", "acc-mock", "acc-mock-label", parsed, "tradebook.xlsx",
      { recompute: false }
    );
    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(2);
    expect(_inserted["trade_lot_matches"] ?? []).toHaveLength(0);
  });

  it("recomputeFifoForAccount inserts lot_matches from existing trades", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = makeAdminMock() as any;
    _db.trades.push(
      { id: "t-buy", account_id: "acc-mock", isin: "INE024L01027", stock_id: "s1",
        trade_date: "2026-04-01", trade_type: "buy", quantity: 100, price: 1355, executed_at: null },
      { id: "t-sell", account_id: "acc-mock", isin: "INE024L01027", stock_id: "s1",
        trade_date: "2026-08-01", trade_type: "sell", quantity: 50, price: 1500, executed_at: null },
    );

    await recomputeFifoForAccount(admin, "user-1", "acc-mock");

    expect((_inserted["trade_lot_matches"] ?? []).length).toBeGreaterThan(0);
  });

  it("auto-applies a verified split and returns inferred ones", async () => {
    // Seed: trades that oversell (100 buy, 200 sell) + a matching ref row.
    _db.trades.push(
      { id: "b", user_id: "u", account_id: "acc-mock", symbol: "SYM", isin: "INE1", stock_id: "s1", trade_date: "2024-01-01", trade_type: "buy", quantity: 100, price: 1000, executed_at: null, broker_trade_id: "b" },
      { id: "s", user_id: "u", account_id: "acc-mock", symbol: "SYM", isin: "INE1", stock_id: "s1", trade_date: "2024-09-01", trade_type: "sell", quantity: 200, price: 600, executed_at: null, broker_trade_id: "s" },
    );
    _db.corporate_action_ref = [
      { symbol: "SYM", isin: "INE1", action_type: "split", ex_date: "2024-05-01", factor: 2 },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = makeAdminMock() as any;
    const res = await recomputeAndDetect(admin, "u", "acc-mock"); // helper: recompute then detectAndApplyForAccount
    expect(res.applied.some((a) => a.symbol === "SYM" && a.factor === 2)).toBe(true);
  });
});
