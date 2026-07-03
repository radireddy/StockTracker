# Redis-backed Rate Limiting via Upstash

**Date:** 2026-07-03
**Status:** Approved (design)

## Problem

Rate limiting is currently in-memory (`src/lib/rate-limit/memory-store.ts`). On
Vercel, each serverless invocation can be a fresh instance with its own empty
`Map`, so the limiter's state is not shared across invocations and effectively
does nothing in production. We need a shared, out-of-process store so limits
hold across all invocations.

## Decision Summary

| Decision | Choice | Rationale |
|---|---|---|
| Backend library | `@upstash/ratelimit` (+ `@upstash/redis`) | Battle-tested sliding window; result shape matches our `RateLimitResult` 1:1; least code; optional ephemeral cache reduces Redis calls |
| Local/test behavior | Fall back to `MemoryStore` when Upstash env vars are absent | Local dev and existing tests keep working with zero Redis setup; Redis only activates on Vercel |
| On Redis runtime error | Fail open (allow request, log warning) | A transient Redis outage must not lock users out of the app |

Free-tier note (verified 2026-07-03): Upstash Redis free tier = 500K
commands/month, 256 MB storage, 10 GB bandwidth, no credit card required.
Native Vercel Marketplace integration auto-injects connection env vars. At this
app's scale (rate checks on 3 API routes only, ~1–2 Redis commands per check)
usage stays comfortably within the free tier.

## Architecture

Reuse the existing abstraction. `src/lib/rate-limit/index.ts` already defines a
`RateLimitStore` interface with `consume(key, limit, windowMs)` and carries a
"swap this line to change backend" comment. The interface is **unchanged**. We
add a second implementation alongside `MemoryStore`.

**API call sites do not change.** `src/app/api/{dashboard,upload,import}/route.ts`
keep calling `rateLimit(user.id, RATE_LIMITS.x)` exactly as today.

### New file: `src/lib/rate-limit/redis-store.ts`

`RedisStore implements RateLimitStore`:

- Constructs an Upstash `Redis` client from env (`Redis.fromEnv()`).
- `@upstash/ratelimit` requires one `Ratelimit` instance per limiter config.
  `consume()` lazily builds and **caches** a `Ratelimit` instance per unique
  `(limit, windowMs)` pair in an internal `Map` keyed by `${limit}:${windowMs}`.
- Each instance: `Ratelimit.slidingWindow(limit, `${windowMs} ms`)` — preserves
  the current sliding-window semantics.
- Options: `analytics: false` (saves commands), `ephemeralCache: new Map()`
  (in-process short-circuit for already-blocked keys → fewer Redis calls).
- Key namespacing is already handled: `index.ts` prefixes the key
  (`import:`, `upload:`, `dashboard:`, `auth:`) before it reaches the store, so
  sharing a `Ratelimit` instance across configs with an identical
  `(limit, windowMs)` pair is safe. (All four current configs are distinct pairs
  regardless.)
- `.limit(key)` returns `{ success, limit, remaining, reset }` where `reset` is
  epoch-ms — maps 1:1 onto our `RateLimitResult`.

### Backend selection (fallback)

Refactor the module-level `const store = new MemoryStore()` in `index.ts` into a
testable factory:

```ts
export function createRateLimitStore(): RateLimitStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new RedisStore();
  }
  return new MemoryStore();
}
const store: RateLimitStore = createRateLimitStore();
```

Redis activates only where both vars exist (Vercel). Local dev and the existing
test suite continue on `MemoryStore` with no setup.

### Fail-open behavior

`RedisStore.consume()` wraps the `.limit()` call in try/catch. On any error:
`logger.warn(...)` and return
`{ success: true, limit, remaining: limit - 1, reset: Date.now() + windowMs }`
so the request proceeds. A Redis outage never blocks legitimate traffic.

## Dependencies & Config

- Add deps: `@upstash/ratelimit`, `@upstash/redis`.
- Add to `.env.local.example` (empty, documented):
  - `UPSTASH_REDIS_REST_URL=`
  - `UPSTASH_REDIS_REST_TOKEN=`
- **Manual step (not automatable here):** In the Vercel dashboard, add Upstash
  via the Marketplace and let it inject `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` into Production/Preview/Development.

## Testing (must hold the 95% coverage thresholds)

- `memory-store.test.ts`, `index.test.ts` — unchanged; still exercise
  `MemoryStore` (no Upstash env vars in the test environment).
- New `redis-store.test.ts` — mock `@upstash/ratelimit` and `@upstash/redis`;
  assert:
  1. `.limit()` result maps correctly onto `RateLimitResult`.
  2. `Ratelimit` instances are cached per `(limit, windowMs)` pair (a second
     `consume()` with the same pair does not construct a new instance).
  3. **Fail-open**: when the mocked `.limit()` throws, `consume()` returns
     `success: true` and logs a warning.
- New selection test for `createRateLimitStore()`: returns `RedisStore` when
  both env vars are set, `MemoryStore` otherwise.

## Out of Scope (YAGNI)

- Multi-region replication.
- Upstash analytics dashboards.
- Per-IP limiting (currently per authenticated `user.id`).
- Changing any of the four limit values in `RATE_LIMITS`.
