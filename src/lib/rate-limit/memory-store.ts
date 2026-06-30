import type { RateLimitResult, RateLimitStore } from "./types";

interface Entry {
  timestamps: number[];
}

export class MemoryStore implements RateLimitStore {
  private store = new Map<string, Entry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    // Cleanup expired entries every 60s to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
    // Allow process to exit without waiting for timer
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Filter to only timestamps within the current window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    const reset = now + windowMs;

    if (entry.timestamps.length >= limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        reset,
      };
    }

    entry.timestamps.push(now);

    return {
      success: true,
      limit,
      remaining: limit - entry.timestamps.length,
      reset,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      // Remove entries where all timestamps are older than 1 hour (max window)
      const newest = entry.timestamps[entry.timestamps.length - 1] ?? 0;
      if (now - newest > 3_600_000) {
        this.store.delete(key);
      }
    }
  }
}
