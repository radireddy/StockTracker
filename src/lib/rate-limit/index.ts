import { MemoryStore } from "./memory-store";
import { RedisStore } from "./redis-store";
import type { RateLimitConfig, RateLimitResult, RateLimitStore } from "./types";

/**
 * Selects the rate limit backend. Uses Upstash Redis when its env vars are
 * present (e.g. on Vercel); otherwise falls back to the in-memory store so
 * local dev and tests need no Redis setup.
 */
export function createRateLimitStore(): RateLimitStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new RedisStore();
  }
  return new MemoryStore();
}

const store: RateLimitStore = createRateLimitStore();

export function rateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const prefixedKey = config.prefix ? `${config.prefix}:${key}` : key;
  return store.consume(prefixedKey, config.limit, config.windowMs);
}

export const RATE_LIMITS = {
  import: { limit: 5, windowMs: 60_000, prefix: "import" },
  upload: { limit: 10, windowMs: 60_000, prefix: "upload" },
  dashboard: { limit: 30, windowMs: 60_000, prefix: "dashboard" },
  auth: { limit: 10, windowMs: 3_600_000, prefix: "auth" },
} satisfies Record<string, RateLimitConfig>;

export type { RateLimitConfig, RateLimitResult, RateLimitStore };
