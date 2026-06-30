import { MemoryStore } from "./memory-store";
import type { RateLimitConfig, RateLimitResult, RateLimitStore } from "./types";

// Swap this line to change backend (e.g. RedisStore):
const store: RateLimitStore = new MemoryStore();

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
