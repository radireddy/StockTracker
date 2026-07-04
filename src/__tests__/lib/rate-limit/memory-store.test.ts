import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryStore } from "@/lib/rate-limit/memory-store";

describe("MemoryStore", () => {
  beforeEach(() => {
    // Freeze time so window math is deterministic and the cleanup interval
    // never fires on its own.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit, reporting decreasing remaining", async () => {
    const store = new MemoryStore();
    const first = await store.consume("k", 3, 60_000);
    const second = await store.consume("k", 3, 60_000);
    const third = await store.consume("k", 3, 60_000);

    expect(first).toMatchObject({ success: true, limit: 3, remaining: 2 });
    expect(second.remaining).toBe(1);
    expect(third.remaining).toBe(0);
  });

  it("rejects the request that exceeds the limit", async () => {
    const store = new MemoryStore();
    await store.consume("k", 1, 60_000);
    const blocked = await store.consume("k", 1, 60_000);

    expect(blocked).toMatchObject({ success: false, limit: 1, remaining: 0 });
    expect(blocked.reset).toBe(Date.now() + 60_000);
  });

  it("keeps separate counters per key", async () => {
    const store = new MemoryStore();
    await store.consume("a", 1, 60_000);
    const other = await store.consume("b", 1, 60_000);
    expect(other.success).toBe(true);
  });

  it("frees capacity once the window slides past old timestamps", async () => {
    const store = new MemoryStore();
    await store.consume("k", 1, 60_000);
    expect((await store.consume("k", 1, 60_000)).success).toBe(false);

    // Advance beyond the window: the old timestamp is now outside it.
    vi.advanceTimersByTime(60_001);
    expect((await store.consume("k", 1, 60_000)).success).toBe(true);
  });

  it("evicts entries whose newest hit is older than the max window during cleanup", async () => {
    const store = new MemoryStore();
    await store.consume("stale", 5, 60_000);

    // Push time past the 1-hour retention, then trigger the cleanup interval.
    vi.advanceTimersByTime(3_600_001);
    vi.advanceTimersByTime(60_000); // fire the 60s cleanup timer

    // After eviction, a fresh consume starts from a clean slate (remaining = limit - 1).
    const after = await store.consume("stale", 5, 60_000);
    expect(after.remaining).toBe(4);
  });

  it("retains entries that are still within the retention window during cleanup", async () => {
    const store = new MemoryStore();
    // Use the 1-hour window so the timestamp is still live when cleanup fires.
    await store.consume("fresh", 2, 3_600_000);

    // Fire the 60s cleanup while the entry is still recent — it must survive.
    vi.advanceTimersByTime(60_000);

    // The earlier hit is retained, so this second consume exhausts the limit.
    const after = await store.consume("fresh", 2, 3_600_000);
    expect(after.remaining).toBe(0);
  });
});
