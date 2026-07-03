import { describe, it, expect, afterEach, vi } from "vitest";
import { rateLimit, RATE_LIMITS, createRateLimitStore } from "@/lib/rate-limit";
import { MemoryStore } from "@/lib/rate-limit/memory-store";
import { RedisStore } from "@/lib/rate-limit/redis-store";

describe("rateLimit", () => {
  it("consumes tokens for a key and blocks past the configured limit", async () => {
    const cfg = { limit: 2, windowMs: 60_000, prefix: "test-a" };
    expect((await rateLimit("u1", cfg)).success).toBe(true);
    expect((await rateLimit("u1", cfg)).success).toBe(true);
    expect((await rateLimit("u1", cfg)).success).toBe(false);
  });

  it("namespaces keys by prefix so the same key in different buckets is independent", async () => {
    const a = { limit: 1, windowMs: 60_000, prefix: "bucket-a" };
    const b = { limit: 1, windowMs: 60_000, prefix: "bucket-b" };
    await rateLimit("shared", a);
    // Same raw key, different prefix → not blocked.
    expect((await rateLimit("shared", b)).success).toBe(true);
  });

  it("works without a prefix", async () => {
    const cfg = { limit: 1, windowMs: 60_000 };
    expect((await rateLimit("no-prefix-key", cfg)).success).toBe(true);
    expect((await rateLimit("no-prefix-key", cfg)).success).toBe(false);
  });

  it("exposes the well-known limit presets", () => {
    expect(RATE_LIMITS.import).toEqual({ limit: 5, windowMs: 60_000, prefix: "import" });
    expect(RATE_LIMITS.upload.prefix).toBe("upload");
    expect(RATE_LIMITS.dashboard.limit).toBe(30);
    expect(RATE_LIMITS.auth.windowMs).toBe(3_600_000);
  });
});

describe("createRateLimitStore", () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  afterEach(() => {
    if (url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = url;
    if (token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = token;
    vi.restoreAllMocks();
  });

  it("returns MemoryStore when Upstash env vars are absent", () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    expect(createRateLimitStore()).toBeInstanceOf(MemoryStore);
  });

  it("returns RedisStore when both Upstash env vars are set", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    expect(createRateLimitStore()).toBeInstanceOf(RedisStore);
  });
});
