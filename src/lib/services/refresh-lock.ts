import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

/**
 * Cross-instance lock guarding the fire-and-forget price refresh triggered from
 * the dashboard. A module-level boolean only guards a single serverless
 * instance, so N concurrent dashboard loads (each on its own instance) could
 * each launch a full portfolio refresh. This uses Upstash Redis `SET NX PX`
 * so only one refresh runs across all instances.
 *
 * When Upstash env vars are absent (local dev, tests), it falls back to an
 * in-process boolean — correct for the single-instance case those environments
 * run in.
 */

const LOCK_KEY = "price-refresh:lock";
// Safety expiry: if the holder crashes before releasing, the lock auto-clears.
// Comfortably longer than a refresh takes, shorter than the refresh cadence.
const LOCK_TTL_MS = 2 * 60 * 1000;

let redisClient: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redisClient === undefined) {
    redisClient =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? Redis.fromEnv()
        : null;
  }
  return redisClient;
}

// In-process fallback for environments without Redis.
let localLocked = false;

/**
 * Attempts to acquire the refresh lock. Returns true if acquired (caller should
 * run the refresh and call `releaseRefreshLock` when done), false if another
 * refresh is already in progress.
 *
 * On a Redis error this fails CLOSED (returns false / skips the refresh): a
 * skipped best-effort background refresh is harmless (manual refresh still
 * works), whereas failing open would reintroduce the stampede this prevents.
 */
export async function acquireRefreshLock(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    if (localLocked) return false;
    localLocked = true;
    return true;
  }

  try {
    const res = await redis.set(LOCK_KEY, "1", { nx: true, px: LOCK_TTL_MS });
    return res === "OK";
  } catch (err) {
    logger.warn("Refresh lock acquire failed; skipping refresh (fail-closed)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Releases the refresh lock. Safe to call even if acquire failed. */
export async function releaseRefreshLock(): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    localLocked = false;
    return;
  }

  try {
    await redis.del(LOCK_KEY);
  } catch {
    // Non-fatal: the TTL will expire the lock on its own.
  }
}
