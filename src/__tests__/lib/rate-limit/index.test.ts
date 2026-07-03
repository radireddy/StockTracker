import { describe, it, expect } from "vitest";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

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
