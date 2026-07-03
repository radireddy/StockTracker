# Redis-backed Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the effectively-no-op in-memory rate limiter with a shared Upstash Redis backend, so limits actually hold across Vercel serverless invocations.

**Architecture:** Reuse the existing `RateLimitStore` abstraction in `src/lib/rate-limit/`. Add a `RedisStore` implementation backed by `@upstash/ratelimit`. Select the backend at module load via a factory: Redis when Upstash env vars are present (Vercel), else the existing `MemoryStore` (local/tests). `RedisStore` fails open on any Redis error.

**Tech Stack:** Next.js 15, TypeScript, `@upstash/ratelimit`, `@upstash/redis`, Vitest (jsdom), existing `@/lib/logger`.

## Global Constraints

- Do not change the `RateLimitStore` interface in `src/lib/rate-limit/types.ts` (`consume(key, limit, windowMs): Promise<RateLimitResult>`).
- Do not change API route call sites — `rateLimit(user.id, RATE_LIMITS.x)` must keep working unchanged.
- Vitest coverage thresholds are 95% (statements/branches/functions/lines) over `src/lib/**`. New code must be covered.
- Tests must not require real Upstash env vars; mock `@upstash/ratelimit` and `@upstash/redis` in unit tests.
- Log via `import { logger } from "@/lib/logger"` and call `logger.warn(message, context)`.
- `RateLimitResult` shape: `{ success: boolean; limit: number; remaining: number; reset: number /* epoch ms */ }`.
- Env var names: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

---

## File Structure

- Create: `src/lib/rate-limit/redis-store.ts` — `RedisStore implements RateLimitStore`, fail-open, per-`(limit,windowMs)` Ratelimit instance cache.
- Create: `src/__tests__/lib/rate-limit/redis-store.test.ts` — unit tests for `RedisStore` (mocked Upstash).
- Modify: `src/lib/rate-limit/index.ts` — extract `createRateLimitStore()` factory; select RedisStore vs MemoryStore by env.
- Modify: `src/__tests__/lib/rate-limit/index.test.ts` — add factory selection tests.
- Modify: `.env.local.example` — document the two Upstash env vars.
- Modify: `package.json` / lockfile — add `@upstash/ratelimit`, `@upstash/redis`.

---

## Task 1: Add dependencies and document env vars

**Files:**
- Modify: `package.json` (+ lockfile) via `npm install`
- Modify: `.env.local.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `@upstash/ratelimit` and `@upstash/redis` importable in later tasks; env vars documented.

- [ ] **Step 1: Install the two libraries**

Run:
```bash
npm install @upstash/ratelimit @upstash/redis
```
Expected: both added to `dependencies` in `package.json`, lockfile updated, exit 0.

- [ ] **Step 2: Document env vars in `.env.local.example`**

Append these two lines to `.env.local.example` (leave values empty; Vercel/Upstash injects them in prod):
```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

- [ ] **Step 3: Verify install and typecheck baseline**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: PASS (no new errors; the new deps are not yet imported).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: add @upstash/ratelimit + @upstash/redis deps and document env vars"
```

---

## Task 2: Implement `RedisStore`

**Files:**
- Create: `src/lib/rate-limit/redis-store.ts`
- Test: `src/__tests__/lib/rate-limit/redis-store.test.ts`

**Interfaces:**
- Consumes: `RateLimitStore`, `RateLimitResult` from `./types`; `Ratelimit` from `@upstash/ratelimit`; `Redis` from `@upstash/redis`; `logger` from `@/lib/logger`.
- Produces: `export class RedisStore implements RateLimitStore` with `async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/rate-limit/redis-store.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture Ratelimit constructor calls and control .limit() behavior.
const limitMock = vi.fn();
const ctorCalls: unknown[] = [];

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: () => ({ __redis: true }) },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    constructor(opts: unknown) {
      ctorCalls.push(opts);
    }
    limit(key: string) {
      return limitMock(key);
    }
    static slidingWindow(limit: number, window: string) {
      return { __limiter: true, limit, window };
    }
  }
  return { Ratelimit };
});

const warnMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: warnMock, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks are registered.
import { RedisStore } from "@/lib/rate-limit/redis-store";

describe("RedisStore", () => {
  beforeEach(() => {
    limitMock.mockReset();
    warnMock.mockReset();
    ctorCalls.length = 0;
  });

  it("maps a successful Upstash result onto RateLimitResult", async () => {
    limitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 1234 });
    const store = new RedisStore();
    const result = await store.consume("import:u1", 5, 60_000);
    expect(result).toEqual({ success: true, limit: 5, remaining: 4, reset: 1234 });
    expect(limitMock).toHaveBeenCalledWith("import:u1");
  });

  it("maps a blocked Upstash result (success: false)", async () => {
    limitMock.mockResolvedValue({ success: false, limit: 5, remaining: 0, reset: 9999 });
    const store = new RedisStore();
    const result = await store.consume("import:u1", 5, 60_000);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("caches one Ratelimit instance per (limit, windowMs) pair", async () => {
    limitMock.mockResolvedValue({ success: true, limit: 5, remaining: 4, reset: 1 });
    const store = new RedisStore();
    await store.consume("a", 5, 60_000);
    await store.consume("b", 5, 60_000); // same pair → reuse
    await store.consume("c", 10, 60_000); // different pair → new instance
    expect(ctorCalls.length).toBe(2);
  });

  it("fails open when Upstash throws", async () => {
    limitMock.mockRejectedValue(new Error("redis down"));
    const store = new RedisStore();
    const result = await store.consume("import:u1", 5, 60_000);
    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(typeof result.reset).toBe("number");
    expect(warnMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/__tests__/lib/rate-limit/redis-store.test.ts
```
Expected: FAIL — cannot resolve `@/lib/rate-limit/redis-store` (module does not exist yet).

- [ ] **Step 3: Implement `RedisStore`**

Create `src/lib/rate-limit/redis-store.ts`:
```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx vitest run src/__tests__/lib/rate-limit/redis-store.test.ts
```
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit/redis-store.ts src/__tests__/lib/rate-limit/redis-store.test.ts
git commit -m "feat: add Upstash Redis-backed rate limit store (fail-open)"
```

---

## Task 3: Wire backend selection into `index.ts`

**Files:**
- Modify: `src/lib/rate-limit/index.ts`
- Modify: `src/__tests__/lib/rate-limit/index.test.ts`

**Interfaces:**
- Consumes: `RedisStore` from `./redis-store`; `MemoryStore` from `./memory-store`; `RateLimitStore` from `./types`.
- Produces: `export function createRateLimitStore(): RateLimitStore`. Existing `rateLimit`, `RATE_LIMITS` exports unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/rate-limit/index.test.ts` (add `afterEach` import at top and this block inside the file):
```ts
import { afterEach, vi } from "vitest";
import { createRateLimitStore } from "@/lib/rate-limit";
import { MemoryStore } from "@/lib/rate-limit/memory-store";
import { RedisStore } from "@/lib/rate-limit/redis-store";

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx vitest run src/__tests__/lib/rate-limit/index.test.ts
```
Expected: FAIL — `createRateLimitStore` is not exported from `@/lib/rate-limit`.

- [ ] **Step 3: Add the factory to `index.ts`**

Edit `src/lib/rate-limit/index.ts`. Replace the top of the file:
```ts
import { MemoryStore } from "./memory-store";
import type { RateLimitConfig, RateLimitResult, RateLimitStore } from "./types";

// Swap this line to change backend (e.g. RedisStore):
const store: RateLimitStore = new MemoryStore();
```
with:
```ts
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
```
Leave the rest of the file (`rateLimit`, `RATE_LIMITS`, re-exports) unchanged.

- [ ] **Step 4: Run the full rate-limit test suite to verify it passes**

Run:
```bash
npx vitest run src/__tests__/lib/rate-limit/
```
Expected: PASS — memory-store, index (incl. new factory tests), and redis-store all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit/index.ts src/__tests__/lib/rate-limit/index.test.ts
git commit -m "feat: select Redis rate-limit backend when Upstash env vars present"
```

---

## Task 4: Full verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: confirmed green lint, typecheck, and coverage.

- [ ] **Step 1: Lint and typecheck**

Run:
```bash
npm run lint && npx tsc --noEmit
```
Expected: PASS, no errors.

- [ ] **Step 2: Full test suite with coverage**

Run:
```bash
npm run test:coverage
```
Expected: PASS; coverage for `src/lib/rate-limit/**` at 100% and overall thresholds (95%) still met.

- [ ] **Step 3: Production build sanity check**

Run:
```bash
npm run build
```
Expected: build succeeds (no env vars required — factory falls back to MemoryStore at build time).

- [ ] **Step 4: If any check fails, fix and re-run before proceeding.**

---

## Post-implementation manual step (not automatable here)

In the Vercel dashboard: **Storage / Integrations → Marketplace → Upstash → create a free Redis database**, and confirm it injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into Production/Preview/Development. No credit card required for the free tier. Once set, the deployed app automatically uses `RedisStore`.
