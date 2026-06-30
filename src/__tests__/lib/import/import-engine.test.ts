import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BrokerParseResult, ParsedTrade, GroupedTrade } from "@/lib/import/types";

// Mock dependencies
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

vi.mock("@/lib/holdings", () => ({
  recomputeHoldings: vi.fn().mockResolvedValue(false),
}));

let mockAdminClient: any;

function createMockParseResult(trades: ParsedTrade[] = [], errors: any[] = []): BrokerParseResult {
  return {
    trades,
    metadata: {
      broker: "zerodha",
      client_id: "YY7859",
      account_label: "YY7859 (Zerodha)",
      date_range: "2024-01-01 to 2024-12-31",
    },
    errors,
  };
}

function makeTrade(overrides: Partial<ParsedTrade> = {}): ParsedTrade {
  return {
    symbol: "RELIANCE",
    isin: "INE002A01018",
    trade_date: "2024-01-15",
    exchange: "NSE",
    trade_type: "buy",
    quantity: 10,
    price: 2500,
    trade_id: "T001",
    order_id: "O001",
    execution_time: "2024-01-15T10:30:00",
    ...overrides,
  };
}

function createMockUserSupabase(options: {
  existingCompanies?: Array<{ id: string; isin: string }>;
  existingTradeIds?: Array<{ trade_id: string; trade_ids: string[] }>;
  insertError?: { code?: string; message: string } | null;
  companyInsertResult?: { data: { id: string } | null; error: any | null };
} = {}) {
  const updateCalls: any[] = [];

  return {
    _updateCalls: updateCalls,
    from: vi.fn((table: string) => {
      if (table === "companies") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                data: options.existingCompanies ?? [],
                error: null,
              })),
              single: vi.fn(() => ({
                data: options.existingCompanies?.[0] ?? null,
                error: null,
              })),
            })),
          })),
          insert: vi.fn(() => {
            if (options.companyInsertResult) return {
              select: vi.fn(() => ({
                single: vi.fn(() => options.companyInsertResult),
              })),
            };
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: { id: "new-company-id" },
                  error: null,
                })),
              })),
            };
          }),
        };
      }
      if (table === "transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                data: options.existingTradeIds ?? [],
                error: null,
              })),
            })),
          })),
          insert: vi.fn(() => {
            if (options.insertError) {
              return { error: options.insertError };
            }
            return { error: null };
          }),
        };
      }
      if (table === "import_jobs") {
        return {
          update: vi.fn((data: any) => {
            updateCalls.push(data);
            return {
              eq: vi.fn(() => ({ error: null })),
            };
          }),
        };
      }
      return {};
    }),
  };
}

describe("executeImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "indian_stocks") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [{ isin: "INE002A01018", name: "Reliance Industries", nse_symbol: "RELIANCE" }],
                error: null,
              })),
            })),
            upsert: vi.fn(() => ({ error: null })),
          };
        }
        return {};
      }),
    };
  });

  it("imports a single trade successfully", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.status).toBe("completed");
    expect(result.imported_count).toBe(1);
    expect(result.skipped_count).toBe(0);
    expect(result.failed_count).toBe(0);
    expect(result.symbols_imported).toContain("RELIANCE");
  });

  it("skips already-imported trades (idempotency)", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
      existingTradeIds: [{ trade_id: "T001", trade_ids: ["T001"] }],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(1);
  });

  it("auto-creates company when not in portfolio", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [], // No existing companies
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.status).toBe("completed");
    expect(result.new_companies_created).toContain("RELIANCE");
  });

  it("handles transaction insert failure", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
      insertError: { message: "Insert failed" },
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.failed_count).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("handles duplicate trade_id constraint (23505)", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
      insertError: { code: "23505", message: "unique constraint trade_id" },
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.skipped_count).toBe(1);
    expect(result.failed_count).toBe(0);
  });

  it("includes parse errors in result", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult(
      [makeTrade({ trade_id: "T001" })],
      [{ severity: "error", symbol: "BAD", message: "Bad row" }]
    );

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.errors.some((e) => e.message === "Bad row")).toBe(true);
  });

  it("sets status to 'failed' when all trades fail", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
      insertError: { message: "DB error" },
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.status).toBe("failed");
  });

  it("handles company creation with duplicate constraint (23505)", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    // Company doesn't exist initially, but insert fails with 23505 (race condition)
    // Then select finds existing company
    let insertCallCount = 0;
    const userSupabase = {
      from: vi.fn((table: string) => {
        if (table === "companies") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((field: string, val: string) => {
                if (field === "portfolio_id") {
                  return {
                    in: vi.fn(() => ({
                      data: [], // No existing companies initially
                      error: null,
                    })),
                    eq: vi.fn(() => ({
                      single: vi.fn(() => ({
                        data: { id: "existing-id" },
                        error: null,
                      })),
                    })),
                  };
                }
                return {
                  single: vi.fn(() => ({
                    data: { id: "existing-id" },
                    error: null,
                  })),
                };
              }),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: null,
                  error: { code: "23505", message: "duplicate" },
                })),
              })),
            })),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({
                  data: [],
                  error: null,
                })),
              })),
            })),
            insert: vi.fn(() => ({ error: null })),
          };
        }
        if (table === "import_jobs") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
        return {};
      }),
    };

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.status).toBe("completed");
  });

  it("handles missing stock for ISIN", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    // Admin client returns no stocks for the ISIN
    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "indian_stocks") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
            upsert: vi.fn(() => ({ error: { message: "insert failed" } })),
          };
        }
        return {};
      }),
    };

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.failed_count).toBe(1);
    expect(result.errors.some((e) => e.message.includes("Stock not found") || e.message.includes("Could not register"))).toBe(true);
  });

  it("auto-creates missing stocks from tradebook data", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    let upsertCalled = false;
    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "indian_stocks") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [], // No existing stocks
                error: null,
              })),
            })),
            upsert: vi.fn(() => {
              upsertCalled = true;
              return { error: null };
            }),
          };
        }
        return {};
      }),
    };

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(upsertCalled).toBe(true);
  });

  it("handles empty trades", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([]);

    const userSupabase = createMockUserSupabase();

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.imported_count).toBe(0);
    expect(result.skipped_count).toBe(0);
    expect(result.failed_count).toBe(0);
  });

  it("handles multiple trades for different symbols", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "indian_stocks") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [
                  { isin: "INE002A01018", name: "Reliance", nse_symbol: "RELIANCE" },
                  { isin: "INE009A01021", name: "Infosys", nse_symbol: "INFY" },
                ],
                error: null,
              })),
            })),
          };
        }
        return {};
      }),
    };

    const parseResult = createMockParseResult([
      makeTrade({ symbol: "RELIANCE", isin: "INE002A01018", trade_id: "T001" }),
      makeTrade({ symbol: "INFY", isin: "INE009A01021", trade_id: "T002" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [
        { id: "c1", isin: "INE002A01018" },
        { id: "c2", isin: "INE009A01021" },
      ],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.imported_count).toBe(2);
    expect(result.symbols_imported).toContain("RELIANCE");
    expect(result.symbols_imported).toContain("INFY");
  });

  it("handles company creation failure (non-23505)", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = {
      from: vi.fn((table: string) => {
        if (table === "companies") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: null,
                  error: { code: "42501", message: "permission denied" },
                })),
              })),
            })),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === "import_jobs") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
        return {};
      }),
    };

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.failed_count).toBe(1);
    expect(result.errors.some((e) => e.message.includes("permission denied"))).toBe(true);
  });

  it("updates import job progress", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    // Final update should include status
    const lastUpdate = userSupabase._updateCalls[userSupabase._updateCalls.length - 1];
    expect(lastUpdate).toBeDefined();
    expect(lastUpdate.status).toBe("completed");
  });

  it("handles BSE exchange in auto-created stocks", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    let upsertData: any = null;
    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "indian_stocks") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [], // No existing stocks
                error: null,
              })),
            })),
            upsert: vi.fn((data: any) => {
              upsertData = data;
              return { error: null };
            }),
          };
        }
        return {};
      }),
    };

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001", exchange: "BSE" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(upsertData).toBeDefined();
    expect(upsertData.exchange).toBe("BSE");
    expect(upsertData.bse_code).toBe("RELIANCE");
  });

  it("reports incomplete history from recomputeHoldings", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");
    const { recomputeHoldings } = await import("@/lib/holdings");

    // Mock recomputeHoldings to return true (incomplete)
    vi.mocked(recomputeHoldings).mockResolvedValueOnce(true);

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.symbols_incomplete_history).toContain("RELIANCE");
    expect(result.errors.some((e) => e.message.includes("more sells than buys"))).toBe(true);
  });

  it("handles recomputeHoldings throwing error", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");
    const { recomputeHoldings } = await import("@/lib/holdings");

    vi.mocked(recomputeHoldings).mockRejectedValueOnce(new Error("Recompute failed"));

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    // Should not throw, just log
    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.status).toBe("completed");
  });

  it("handles 23505 company create with null re-select", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = {
      from: vi.fn((table: string) => {
        if (table === "companies") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((field: string) => {
                if (field === "portfolio_id") {
                  return {
                    in: vi.fn(() => ({ data: [], error: null })),
                    eq: vi.fn(() => ({
                      single: vi.fn(() => ({
                        data: null, // Can't find existing company on re-select
                        error: null,
                      })),
                    })),
                  };
                }
                return {};
              }),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(() => ({
                  data: null,
                  error: { code: "23505", message: "duplicate" },
                })),
              })),
            })),
          };
        }
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn(() => ({ data: [], error: null })),
              })),
            })),
          };
        }
        if (table === "import_jobs") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
        return {};
      }),
    };

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(result.failed_count).toBe(1);
    expect(result.errors.some((e) => e.message.includes("Failed to create company"))).toBe(true);
  });

  it("handles partial new trade_ids in a group", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    // Two trades with same key will be grouped, but one is already imported
    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001", quantity: 10 }),
      makeTrade({ trade_id: "T002", quantity: 5 }), // Same key, will be grouped
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
      existingTradeIds: [{ trade_id: "T001", trade_ids: ["T001"] }],
    });

    const result = await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    // One group with 2 trade_ids, but T001 already exists, so only T002 is new
    expect(result.imported_count).toBe(1);
  });

  it("retries stock insert without symbol columns on failure", async () => {
    const { executeImport } = await import("@/lib/import/import-engine");

    let upsertCallCount = 0;
    mockAdminClient = {
      from: vi.fn((table: string) => {
        if (table === "indian_stocks") {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                data: [],
                error: null,
              })),
            })),
            upsert: vi.fn(() => {
              upsertCallCount++;
              if (upsertCallCount === 1) {
                return { error: { message: "unique constraint nse_symbol" } };
              }
              return { error: null };
            }),
          };
        }
        return {};
      }),
    };

    const parseResult = createMockParseResult([
      makeTrade({ trade_id: "T001" }),
    ]);

    const userSupabase = createMockUserSupabase({
      existingCompanies: [{ id: "c1", isin: "INE002A01018" }],
    });

    await executeImport(
      "user-1",
      "portfolio-1",
      "owner-1",
      "job-1",
      parseResult,
      userSupabase
    );

    expect(upsertCallCount).toBe(2); // First attempt + retry
  });
});
