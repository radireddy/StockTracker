# Axiom Logging on Vercel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make server-side application logs reliably reach an Axiom dataset from the app running on Vercel, using the `next-axiom` SDK.

**Architecture:** The logger abstraction and adoption already exist. Two code changes remain: (1) add a `flush()` method to the `Logger` interface and both providers, and make the provider selector recognize the non-public `AXIOM_DATASET`; (2) call `after(() => log.flush())` from `next/server` at the top of every server action and route handler so buffered logs are sent before Vercel freezes the function. Env vars use the non-public `AXIOM_TOKEN`/`AXIOM_DATASET` so the ingest token never ships to the browser.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, `next-axiom@1.10.0`, Vitest (jsdom), Vercel.

**Spec:** `docs/superpowers/specs/2026-07-03-axiom-logging-vercel-design.md`

## Global Constraints

- Package manager is **npm** (`package-lock.json`). Run scripts as `npm test`, `npm run lint`, `npm run build`.
- Env vars are the **non-public** `AXIOM_TOKEN` and `AXIOM_DATASET` — never `NEXT_PUBLIC_AXIOM_*`. Scope is server-side only.
- Do NOT import `next/server` (or anything server-only like `after`) into `src/lib/logger/**` — those modules are imported by Client Components (`error.tsx`). `after(...)` is added only in server-only files (action files, `route.ts`).
- Coverage thresholds are 95% (statements/branches/functions/lines) over `src/lib/**` and `src/types/**`. `src/lib/logger/providers/axiom.ts` is excluded from coverage (see `vitest.config.ts`). Files under `src/app/**` are not in the coverage include set.
- Follow the existing error-handling convention (mutations return `ActionResult`, reads throw); do not change it.

---

## File Structure

- `src/lib/logger/types.ts` — `Logger` interface; add `flush(): Promise<void>`.
- `src/lib/logger/providers/console.ts` — `ConsoleLogger`; add no-op `flush()`.
- `src/lib/logger/providers/axiom.ts` — `AxiomLoggerAdapter`; add `flush()` delegating to `next-axiom`.
- `src/lib/logger/index.ts` — provider selector; detect `AXIOM_DATASET` in addition to `NEXT_PUBLIC_AXIOM_DATASET`.
- `src/__tests__/lib/logger/console-logger.test.ts` — add flush test.
- `src/__tests__/lib/logger/index.test.ts` — add non-public dataset selection test.
- `src/__tests__/lib/logger/axiom-logger.test.ts` — NEW; verifies flush delegation + context forwarding.
- `src/app/(authenticated)/actions/*.ts` (11 files) + `src/app/api/**/route.ts` + `src/app/auth/callback/route.ts` — add `after(() => log.flush())` per handler.
- `.env.local.example` — document `AXIOM_DATASET` / `AXIOM_TOKEN`.

---

## Task 1: Logger `flush()` support + non-public dataset detection

**Files:**
- Modify: `src/lib/logger/types.ts`
- Modify: `src/lib/logger/providers/console.ts`
- Modify: `src/lib/logger/providers/axiom.ts`
- Modify: `src/lib/logger/index.ts:10-12`
- Test: `src/__tests__/lib/logger/console-logger.test.ts`
- Test: `src/__tests__/lib/logger/index.test.ts`
- Test (create): `src/__tests__/lib/logger/axiom-logger.test.ts`

**Interfaces:**
- Produces: `Logger.flush(): Promise<void>` — added to the interface; both providers implement it. Task 2 relies on `log.flush()` existing on every logger returned by `createLogger()`.
- Produces: `createLogger()` selects the Axiom provider when either `AXIOM_DATASET` or `NEXT_PUBLIC_AXIOM_DATASET` is set, else the console provider.
- Consumes: existing `AxiomLoggerAdapter` constructor `constructor(axiom?: AxiomLogger, context?: LogContext)` — the optional first arg lets tests inject a fake `next-axiom` logger.

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/logger/console-logger.test.ts` (inside the existing `describe("ConsoleLogger", ...)` block):

```ts
  it("flush resolves without throwing and logs nothing", async () => {
    const logger = new ConsoleLogger({}, "debug");
    await expect(logger.flush()).resolves.toBeUndefined();
    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.info).not.toHaveBeenCalled();
  });
```

Append to `src/__tests__/lib/logger/index.test.ts` (inside `describe("logger index", ...)`):

```ts
  it("selects the axiom provider when AXIOM_DATASET (non-public) is set", async () => {
    delete process.env.NEXT_PUBLIC_AXIOM_DATASET;
    process.env.AXIOM_DATASET = "test-dataset";
    const { createLogger } = await import("@/lib/logger");
    const logger = createLogger({ service: "test" });
    expect(logger.constructor.name).toBe("AxiomLoggerAdapter");
    expect(typeof logger.flush).toBe("function");
    delete process.env.AXIOM_DATASET;
  });
```

Create `src/__tests__/lib/logger/axiom-logger.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { AxiomLoggerAdapter } from "@/lib/logger/providers/axiom";
import { Logger as AxiomLogger } from "next-axiom";

function makeFakeAxiom() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    with: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

describe("AxiomLoggerAdapter", () => {
  it("flush() delegates to the underlying axiom logger", async () => {
    const fake = makeFakeAxiom();
    const adapter = new AxiomLoggerAdapter(fake as unknown as AxiomLogger, {});
    await adapter.flush();
    expect(fake.flush).toHaveBeenCalledOnce();
  });

  it("forwards log calls with merged context", () => {
    const fake = makeFakeAxiom();
    const adapter = new AxiomLoggerAdapter(fake as unknown as AxiomLogger, { service: "x" });
    adapter.info("hello", { a: 1 });
    expect(fake.info).toHaveBeenCalledWith("hello", { service: "x", a: 1 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
npx vitest run src/__tests__/lib/logger/console-logger.test.ts src/__tests__/lib/logger/index.test.ts src/__tests__/lib/logger/axiom-logger.test.ts
```
Expected: FAIL. `console-logger` and `axiom-logger` fail with `logger.flush is not a function` (flush not implemented); the index test fails because with only `AXIOM_DATASET` set the selector still returns `ConsoleLogger` (so `constructor.name` is `"ConsoleLogger"`, not `"AxiomLoggerAdapter"`).

- [ ] **Step 3: Add `flush()` to the `Logger` interface**

Edit `src/lib/logger/types.ts` — add the method to the interface:

```ts
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
  flush(): Promise<void>;
}
```

- [ ] **Step 4: Implement `flush()` in the console provider**

Edit `src/lib/logger/providers/console.ts` — add this method to the `ConsoleLogger` class, right after `child(...)`:

```ts
  async flush(): Promise<void> {
    // Console output is synchronous; nothing to flush.
  }
```

- [ ] **Step 5: Implement `flush()` in the axiom provider**

Edit `src/lib/logger/providers/axiom.ts` — add this method to the `AxiomLoggerAdapter` class, right after `child(...)`:

```ts
  async flush(): Promise<void> {
    await this.axiom.flush();
  }
```

- [ ] **Step 6: Detect the non-public dataset in the selector**

Edit `src/lib/logger/index.ts` — replace the `isAxiomConfigured` constant (lines 10-12):

```ts
const isAxiomConfigured =
  typeof process !== "undefined" &&
  !!(process.env.AXIOM_DATASET || process.env.NEXT_PUBLIC_AXIOM_DATASET);
```

- [ ] **Step 7: Run the logger tests to verify they pass**

Run:
```bash
npx vitest run src/__tests__/lib/logger/console-logger.test.ts src/__tests__/lib/logger/index.test.ts src/__tests__/lib/logger/axiom-logger.test.ts
```
Expected: PASS (all tests green).

- [ ] **Step 8: Run the full suite, lint, and typecheck**

Run:
```bash
npm test
npm run lint
npx tsc --noEmit
```
Expected: all pass, no type errors. Coverage thresholds (95%) still met — the new `flush()` on `ConsoleLogger` is exercised by Step 1's test; `axiom.ts` is coverage-excluded.

- [ ] **Step 9: Commit**

```bash
git add src/lib/logger src/__tests__/lib/logger
git commit -m "feat(logger): add flush() and detect non-public AXIOM_DATASET"
```

---

## Task 2: Flush logs after the response in every server action and route handler

Adds `after(() => log.flush())` from `next/server` as the first statement of every server action and route handler that owns a module-scoped `log`. Without this, `next-axiom`'s trailing 1-second buffer never sends on Vercel (the function freezes first). Files under `src/app/**` are not unit-tested; this task is verified by build, lint, and a grep count.

**Files (all have a module-scoped `const log = createLogger(...)`):**

Server actions — Modify (add `after` to the existing `next/server` import if present, else add the import; insert `after(() => log.flush());` as the first line of each listed function):

- `src/app/(authenticated)/actions/account-actions.ts` — `getAccounts`, `createAccount`, `updateAccount`, `deleteAccount` (4)
- `src/app/(authenticated)/actions/company-actions.ts` — `getCompany`, `createCompany`, `updateCompany`, `deleteCompany`, `getCompanyHighlights`, `deleteAllCompanies`, `moveCompany` (7)
- `src/app/(authenticated)/actions/financial-actions.ts` — `upsertFinancialYear`, `bulkUpsertFinancialYears` (2)
- `src/app/(authenticated)/actions/holdings-actions.ts` — `getHoldingsForCompany`, `addHolding`, `updateHolding`, `deleteHolding`, `createCompanyWithHolding` (5)
- `src/app/(authenticated)/actions/pnl-actions.ts` — `getPortfolioPnL`, `getCompanyPnL` (2)
- `src/app/(authenticated)/actions/portfolio-actions.ts` — `getPortfolios`, `getPortfolio`, `getPortfolioDeletionSummary`, `createPortfolio`, `updatePortfolio`, `setDefaultPortfolio`, `deletePortfolio`, `reorderPortfolios` (8)
- `src/app/(authenticated)/actions/price-actions.ts` — `fetchStockPrice`, `manualRefreshPrices` (2)
- `src/app/(authenticated)/actions/projection-actions.ts` — `createProjectionModel`, `deleteProjectionModel`, `setDefaultProjectionModel`, `saveAllProjections` (4)
- `src/app/(authenticated)/actions/stock-actions.ts` — `searchStocks`, `getStockByIsin` (2)
- `src/app/(authenticated)/actions/timeline-actions.ts` — `createTimelineEntry`, `updateTimelineEntry`, `deleteTimelineEntry` (3)
- `src/app/(authenticated)/actions/valuation-actions.ts` — `upsertValuation` (1)

Route handlers — Modify:

- `src/app/api/dashboard/route.ts` — `GET` (1)
- `src/app/api/import/route.ts` — `POST`, `GET`, `DELETE` (3)
- `src/app/api/upload/route.ts` — `POST` (1)
- `src/app/auth/callback/route.ts` — `GET` (1)

Do NOT modify `src/app/(authenticated)/actions/settings-actions.ts` (no logger).

Total handlers: **46** (40 actions + 6 route handlers).

**Interfaces:**
- Consumes: `log.flush()` from Task 1 (present on every `createLogger()` result).
- Consumes: `after` from `next/server` (Next 16 stable).

- [ ] **Step 1: Add the import — `next/server` `after`**

In each file above, ensure `after` is imported from `next/server`.

- If the file already imports from `"next/server"` (e.g. `import { type NextRequest } from "next/server";` or `import { NextResponse } from "next/server";`), add `after` to that import, e.g.:
  ```ts
  import { NextResponse, after } from "next/server";
  ```
- If the file has no `next/server` import (typical for the action files), add a new line at the top of the import block:
  ```ts
  import { after } from "next/server";
  ```

- [ ] **Step 2: Insert the flush call in each handler**

Insert `after(() => log.flush());` as the **first statement** inside each listed function body.

Worked example — server action (`account-actions.ts`), before:
```ts
export async function getAccounts(): Promise<Account[]> {
  const supabase = await createClient();
  // ...
}
```
after:
```ts
export async function getAccounts(): Promise<Account[]> {
  after(() => log.flush());
  const supabase = await createClient();
  // ...
}
```

Worked example — route handler (`api/dashboard/route.ts`), before:
```ts
export async function GET(request: NextRequest) {
  // ...
}
```
after:
```ts
export async function GET(request: NextRequest) {
  after(() => log.flush());
  // ...
}
```

Apply the identical `after(() => log.flush());` first-line insertion to all 46 handlers listed above. The module-scoped `log` is in scope for every function in its file, so the call compiles even in handlers that do not otherwise log (it simply flushes an empty buffer — harmless).

- [ ] **Step 3: Verify the flush call count**

Run:
```bash
grep -rc "after(() => log.flush())" "src/app" | grep -v ":0"
```
Expected output lists exactly these files with counts summing to 46:
```
src/app/(authenticated)/actions/account-actions.ts:4
src/app/(authenticated)/actions/company-actions.ts:7
src/app/(authenticated)/actions/financial-actions.ts:2
src/app/(authenticated)/actions/holdings-actions.ts:5
src/app/(authenticated)/actions/pnl-actions.ts:2
src/app/(authenticated)/actions/portfolio-actions.ts:8
src/app/(authenticated)/actions/price-actions.ts:2
src/app/(authenticated)/actions/projection-actions.ts:4
src/app/(authenticated)/actions/stock-actions.ts:2
src/app/(authenticated)/actions/timeline-actions.ts:3
src/app/(authenticated)/actions/valuation-actions.ts:1
src/app/api/dashboard/route.ts:1
src/app/api/import/route.ts:3
src/app/api/upload/route.ts:1
src/app/auth/callback/route.ts:1
```

- [ ] **Step 4: Update `.env.local.example`**

Append to `.env.local.example`:
```
# Axiom logging (server-side only). Leave unset to log to console.
AXIOM_DATASET=your-axiom-dataset
AXIOM_TOKEN=your-axiom-api-token
```

- [ ] **Step 5: Build, lint, typecheck, test**

Run:
```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
```
Expected: all pass. `npm run build` confirms `after` is imported everywhere it is used (any missing import fails the build with `Cannot find name 'after'`).

- [ ] **Step 6: Commit**

```bash
git add "src/app" .env.local.example
git commit -m "feat(logger): flush Axiom logs after response in actions and routes"
```

---

## Post-implementation: manual setup (performed by the user — not a code task)

1. Create an Axiom account at https://app.axiom.co and a **dataset** (e.g. `stocktracker`).
2. Create an **API token** with **ingest** permission scoped to that dataset (shown once — copy it).
3. Local: set `AXIOM_DATASET` and `AXIOM_TOKEN` in `.env.local`, run `npm run dev`, trigger an action, confirm events appear in the Axiom dataset stream.
4. Vercel: Project → Settings → Environment Variables → add `AXIOM_DATASET` and `AXIOM_TOKEN` for Production (and Preview if desired). Do **not** prefix with `NEXT_PUBLIC_`.
5. Redeploy, exercise the app, and confirm logs in Axiom filtered by the `service` field (e.g. `service == "holdings-actions"`).

## Known limitation (from spec)

Client-component error boundaries (`error.tsx`, `global-error.tsx`, authenticated `error.tsx`) log to the browser console only, not Axiom, because the non-public env vars are not exposed to the browser. Accepted trade-off to keep the ingest token out of the client bundle.

---

## Self-Review

- **Spec coverage:** flush-reliability fix → Task 1 (flush) + Task 2 (wiring); non-public env detection → Task 1 Step 6; env vars → Task 2 Step 4; runbook → Post-implementation section; tests → Task 1 Steps 1/7/8; known limitation → carried over. All spec sections mapped.
- **Placeholder scan:** env example uses intentional sample values (`your-axiom-dataset`); no TBD/TODO; every code step shows complete code.
- **Type consistency:** `flush(): Promise<void>` used identically in the interface (Task 1 Step 3) and both providers (Steps 4-5); `log.flush()` in Task 2 matches. `after` imported from `next/server` consistently. `AxiomLoggerAdapter` constructor signature matches the existing source.
