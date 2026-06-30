import { describe, it, expect, vi } from "vitest";
import { recomputeHoldings } from "@/lib/holdings";

// Mock the logger module
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }),
}));

function createMockSupabase(transactions: any[] = [], options: { updateError?: string; upsertError?: string } = {}) {
  const deleteCalls: any[] = [];
  const updateCalls: any[] = [];
  const upsertCalls: any[] = [];

  const mockChain = (method: string) => {
    let state: any = {};

    const chain: any = {
      from: vi.fn((table: string) => {
        state = { table };
        return chain;
      }),
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      not: vi.fn(() => chain),
      order: vi.fn(() => chain),
      delete: vi.fn(() => {
        deleteCalls.push({ table: state.table });
        return chain;
      }),
      update: vi.fn((data: any) => {
        if (options.updateError) {
          updateCalls.push(data);
          return { error: { message: options.updateError }, data: null };
        }
        updateCalls.push(data);
        return chain;
      }),
      upsert: vi.fn((data: any) => {
        if (options.upsertError) {
          upsertCalls.push(data);
          return { error: { message: options.upsertError } };
        }
        upsertCalls.push(data);
        return { error: null };
      }),
    };

    // Initial select().eq().order() for fetching transactions
    chain.from = vi.fn((table: string) => {
      state.table = table;
      if (table === "transactions") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                order: vi.fn(() => ({
                  data: transactions,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === "companies") {
        return {
          update: vi.fn((data: any) => {
            if (options.updateError) {
              return { eq: vi.fn(() => ({ error: { message: options.updateError } })) };
            }
            updateCalls.push(data);
            return { eq: vi.fn(() => ({ error: null })) };
          }),
        };
      }
      if (table === "owner_holdings") {
        return {
          upsert: vi.fn((data: any, _opts: any) => {
            if (options.upsertError) {
              upsertCalls.push(data);
              return { error: { message: options.upsertError } };
            }
            upsertCalls.push(data);
            return { error: null };
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              not: vi.fn(() => ({})),
            })),
          })),
        };
      }
      return chain;
    });

    return chain;
  };

  return { client: mockChain(""), deleteCalls, updateCalls, upsertCalls };
}

describe("recomputeHoldings", () => {
  it("resets company when no transactions", async () => {
    const updateCalls: any[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: [], error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn((data: any) => {
              updateCalls.push(data);
              return { eq: vi.fn(() => ({ error: null })) };
            }),
          };
        }
        if (table === "owner_holdings") {
          return {
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({})),
            })),
          };
        }
      }),
    };

    const result = await recomputeHoldings("company-1", supabase);
    expect(result).toBe(false);
    expect(updateCalls[0]).toEqual({
      quantity: null,
      avg_buy_price: null,
      buy_date: null,
    });
  });

  it("throws when fetch fails", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              order: vi.fn(() => ({
                data: null,
                error: { message: "DB error" },
              })),
            })),
          })),
        })),
      })),
    };

    await expect(recomputeHoldings("c1", supabase)).rejects.toThrow("DB error");
  });

  it("computes FIFO holdings for single owner with buys only", async () => {
    const transactions = [
      { type: "BUY", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
      { type: "BUY", quantity: 20, price: 150, date: "2024-02-01", owner_id: "o1", user_id: "u1" },
    ];

    const upsertCalls: any[] = [];
    const updateCalls: any[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn((data: any) => {
              upsertCalls.push(data);
              return { error: null };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn((data: any) => {
              updateCalls.push(data);
              return { eq: vi.fn(() => ({ error: null })) };
            }),
          };
        }
      }),
    };

    const result = await recomputeHoldings("c1", supabase);
    expect(result).toBe(false);

    // Owner holdings: qty=30, cost=10*100+20*150=4000, avg=133.33
    expect(upsertCalls[0].quantity).toBe(30);
    expect(upsertCalls[0].avg_buy_price).toBeCloseTo(133.33, 1);

    // Company aggregate
    expect(updateCalls[0].quantity).toBe(30);
    expect(updateCalls[0].buy_date).toBe("2024-01-01");
  });

  it("computes FIFO with partial sell", async () => {
    const transactions = [
      { type: "BUY", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
      { type: "BUY", quantity: 10, price: 200, date: "2024-02-01", owner_id: "o1", user_id: "u1" },
      { type: "SELL", quantity: 5, price: 250, date: "2024-03-01", owner_id: "o1", user_id: "u1" },
    ];

    const upsertCalls: any[] = [];
    const updateCalls: any[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn((data: any) => {
              upsertCalls.push(data);
              return { error: null };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn((data: any) => {
              updateCalls.push(data);
              return { eq: vi.fn(() => ({ error: null })) };
            }),
          };
        }
      }),
    };

    const result = await recomputeHoldings("c1", supabase);
    expect(result).toBe(false);

    // FIFO: Sell 5 from first lot (10@100), remaining: 5@100 + 10@200
    // qty = 15, cost = 5*100 + 10*200 = 2500, avg = 166.67
    expect(upsertCalls[0].quantity).toBe(15);
    expect(upsertCalls[0].avg_buy_price).toBeCloseTo(166.67, 1);
  });

  it("computes FIFO with complete sell of first lot", async () => {
    const transactions = [
      { type: "BUY", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
      { type: "BUY", quantity: 10, price: 200, date: "2024-02-01", owner_id: "o1", user_id: "u1" },
      { type: "SELL", quantity: 10, price: 250, date: "2024-03-01", owner_id: "o1", user_id: "u1" },
    ];

    const upsertCalls: any[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn((data: any) => {
              upsertCalls.push(data);
              return { error: null };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn((data: any) => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
      }),
    };

    await recomputeHoldings("c1", supabase);
    // 10@200 remaining
    expect(upsertCalls[0].quantity).toBe(10);
    expect(upsertCalls[0].avg_buy_price).toBe(200);
  });

  it("detects incomplete history (sells without buys)", async () => {
    const transactions = [
      { type: "SELL", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
    ];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn(() => ({ error: null })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
      }),
    };

    const result = await recomputeHoldings("c1", supabase);
    expect(result).toBe(true);
  });

  it("handles multiple owners", async () => {
    const transactions = [
      { type: "BUY", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
      { type: "BUY", quantity: 20, price: 200, date: "2024-01-01", owner_id: "o2", user_id: "u1" },
    ];

    const upsertCalls: any[] = [];
    const updateCalls: any[] = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn((data: any) => {
              upsertCalls.push(data);
              return { error: null };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn((data: any) => {
              updateCalls.push(data);
              return { eq: vi.fn(() => ({ error: null })) };
            }),
          };
        }
      }),
    };

    await recomputeHoldings("c1", supabase);

    // Two owners should have separate upserts
    expect(upsertCalls).toHaveLength(2);

    // Aggregate: qty=30, cost=10*100+20*200=5000, avg=166.67
    expect(updateCalls[0].quantity).toBe(30);
  });

  it("throws when company update fails", async () => {
    const transactions = [
      { type: "BUY", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
    ];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn(() => ({ error: null })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: { message: "Update failed" } })),
            })),
          };
        }
      }),
    };

    await expect(recomputeHoldings("c1", supabase)).rejects.toThrow("Update failed");
  });

  it("handles upsert error gracefully (logs but continues)", async () => {
    const transactions = [
      { type: "BUY", quantity: 10, price: 100, date: "2024-01-01", owner_id: "o1", user_id: "u1" },
    ];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "transactions") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  order: vi.fn(() => ({ data: transactions, error: null })),
                })),
              })),
            })),
          };
        }
        if (table === "owner_holdings") {
          return {
            upsert: vi.fn(() => ({ error: { message: "Upsert error" } })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({})),
              })),
            })),
          };
        }
        if (table === "companies") {
          return {
            update: vi.fn(() => ({
              eq: vi.fn(() => ({ error: null })),
            })),
          };
        }
      }),
    };

    // Should not throw, just log the error
    const result = await recomputeHoldings("c1", supabase);
    expect(typeof result).toBe("boolean");
  });
});
