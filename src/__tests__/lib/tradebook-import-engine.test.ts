import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TradebookParseResult } from "@/lib/import/tradebook-types";

// ── Supabase mock ─────────────────────────────────────────────────────────────

const _db: Record<string, Record<string, unknown>[]> = {
  import_tradebooks: [],
  trades: [],
  trade_lot_matches: [],
};
const _inserted: Record<string, unknown[]> = {};

function resetDb() {
  for (const k of Object.keys(_db)) _db[k] = [];
  for (const k of Object.keys(_inserted)) delete _inserted[k];
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
        // upsert — ON CONFLICT DO NOTHING: skip rows whose broker_trade_id already exists
        upsert: (rows: unknown, _opts?: unknown) => {
          const arr = (Array.isArray(rows) ? rows : [rows]) as Record<string, unknown>[];
          const existing = new Set(
            tableData().map((r) => `${(r as Record<string, unknown>).account_id}||${(r as Record<string, unknown>).broker_trade_id}`)
          );
          const fresh = arr.filter(
            (r) => !existing.has(`${r.account_id}||${r.broker_trade_id}`)
          );
          const withIds = fresh.map((r, i) => ({
            ...r,
            id: `trade-${tableData().length + i}`,
          }));
          _db[table] = [..._db[table], ...withIds];
          return {
            select: async () => ({ data: withIds, error: null }),
          };
        },
        // select — returns all rows for the table (simple, no real filtering)
        select: (_cols?: string) => ({
          eq: (_col: string, _val: unknown) => ({
            order: (_c: string, _o?: unknown) => ({
              then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                resolve({ data: _db[table], error: null }),
            }),
          }),
          order: (_c: string, _o?: unknown) => ({
            then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
              resolve({ data: _db[table], error: null }),
          }),
        }),
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

import { executeTradebookImport } from "@/lib/import/tradebook-import-engine";

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
});
