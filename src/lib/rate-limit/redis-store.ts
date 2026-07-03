import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";
import type { RateLimitResult, RateLimitStore } from "./types";

/**
 * Rate limit store backed by Upstash Redis. Shared across all serverless
 * invocations, unlike the in-memory store. Fails open on any Redis error so a
 * transient outage never locks users out.
 */
export class RedisStore implements RateLimitStore {
  private readonly redis: Redis;
  private readonly cache = new Map<string, Ratelimit>();

  constructor() {
    // Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN from env.
    this.redis = Redis.fromEnv();
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    try {
      const limiter = this.getLimiter(limit, windowMs);
      // The rate-limit write is awaited inside .limit(); the returned `pending`
      // promise is a no-op with single-region Redis + analytics:false, so there
      // is nothing to waitUntil. (Revisit if multi-region/analytics are enabled.)
      const { success, remaining, reset } = await limiter.limit(key);
      return { success, limit, remaining, reset };
    } catch (err) {
      // Fail open: allow the request through but record the failure.
      logger.warn("Rate limit check failed; allowing request (fail-open)", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return { success: true, limit, remaining: limit - 1, reset: Date.now() + windowMs };
    }
  }

  private getLimiter(limit: number, windowMs: number): Ratelimit {
    const cacheKey = `${limit}:${windowMs}`;
    let limiter = this.cache.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis: this.redis,
        limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
        analytics: false,
        ephemeralCache: new Map(),
      });
      this.cache.set(cacheKey, limiter);
    }
    return limiter;
  }
}
