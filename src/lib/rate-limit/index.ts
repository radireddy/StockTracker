import { MemoryStore } from "./memory-store";
import { RedisStore } from "./redis-store";
import { logger } from "@/lib/logger";
import type { RateLimitConfig, RateLimitResult, RateLimitStore } from "./types";

/**
 * Selects the rate limit backend. Uses Upstash Redis when its env vars are
 * present (e.g. on Vercel); otherwise falls back to the in-memory store so
 * local dev and tests need no Redis setup.
 *
 * If Redis is configured but the client cannot be constructed (e.g. a malformed
 * URL in the environment), we degrade to the in-memory store rather than throw.
 * This matches the fail-open philosophy of the Redis store itself and keeps a
 * misconfigured env var from crashing every request (or the build).
 */
export function createRateLimitStore(): RateLimitStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return new RedisStore();
    } catch (err) {
      logger.error(
        "Upstash Redis is configured but the client could not be initialized; " +
          "falling back to the in-memory rate limit store. Distributed rate " +
          "limiting is disabled until the Upstash env vars are corrected.",
        { error: err instanceof Error ? err.message : String(err) },
      );
      return new MemoryStore();
    }
  }
  return new MemoryStore();
}

// Constructed lazily on first use, not at module load. Route modules import
// this file during `next build` page-data collection; eager construction would
// build the Redis client at build time — where env vars may be absent or
// invalid — and abort the build.
let store: RateLimitStore | undefined;

function getStore(): RateLimitStore {
  return (store ??= createRateLimitStore());
}

export function rateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const prefixedKey = config.prefix ? `${config.prefix}:${key}` : key;
  return getStore().consume(prefixedKey, config.limit, config.windowMs);
}

export const RATE_LIMITS = {
  import: { limit: 5, windowMs: 60_000, prefix: "import" },
  upload: { limit: 10, windowMs: 60_000, prefix: "upload" },
  dashboard: { limit: 30, windowMs: 60_000, prefix: "dashboard" },
  auth: { limit: 10, windowMs: 3_600_000, prefix: "auth" },
  // Manual price refresh fans out to the external quote provider (Yahoo) for
  // every held symbol, so it is expensive and throttled per user.
  refreshPrices: { limit: 5, windowMs: 60_000, prefix: "refresh_prices" },
} satisfies Record<string, RateLimitConfig>;

export type { RateLimitConfig, RateLimitResult, RateLimitStore };
