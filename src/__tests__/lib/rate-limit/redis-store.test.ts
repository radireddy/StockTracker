import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so they're available inside vi.mock() factories.
const { limitMock, ctorCalls, warnMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const ctorCalls: unknown[] = [];
  const warnMock = vi.fn();
  return { limitMock, ctorCalls, warnMock };
});

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ __redis: true }) },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    constructor(opts: unknown) {
      ctorCalls.push(opts);
    }
    limit(key: string) {
      return limitMock(key);
    }
    static slidingWindow(limit: number, window: string) {
      return { __limiter: true, limit, window };
    }
  }
  return { Ratelimit };
});

vi.mock("@/lib/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks are registered.
import { RedisStore } from "@/lib/rate-limit/redis-store";

describe("RedisStore", () => {
  beforeEach(() => {
    limitMock.mockReset();
    warnMock.mockReset();
    ctorCalls.length = 0;
  });

  it("maps a successful Upstash result onto RateLimitResult", async () => {
    limitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 1234 });
    const store = new RedisStore();
    const result = await store.consume("import:u1", 5, 60_000);
    expect(result).toEqual({ success: true, limit: 5, remaining: 4, reset: 1234 });
    expect(limitMock).toHaveBeenCalledWith("import:u1");
  });

  it("maps a blocked Upstash result (success: false)", async () => {
    limitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 9999 });
    const store = new RedisStore();
    const result = await store.consume("import:u1", 5, 60_000);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("caches one Ratelimit instance per (limit, windowMs) pair", async () => {
    limitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 1 });
    const store = new RedisStore();
    await store.consume("a", 5, 60_000);
    await store.consume("b", 5, 60_000); // same pair → reuse
    await store.consume("c", 10, 60_000); // different pair → new instance
    expect(ctorCalls.length).toBe(2);
  });

  it("fails open when Upstash throws", async () => {
    limitMock.mockRejectedValue(new Error("redis down"));
    const store = new RedisStore();
    const result = await store.consume("import:u1", 5, 60_000);
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(typeof result.reset).toBe("number");
    expect(warnMock).toHaveBeenCalled();
  });
});
