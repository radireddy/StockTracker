# Production-Grade Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured, provider-agnostic logging across the entire StockTracker codebase using next-axiom, enabling fast troubleshooting and future alerting.

**Architecture:** Logger abstraction layer (`src/lib/logger/`) with swappable providers. Application code imports only from `@/lib/logger`. Default provider is `next-axiom` (production) with structured console fallback (dev).

**Tech Stack:** next-axiom, Next.js 15 App Router, TypeScript

---

### Task 1: Install next-axiom and configure Next.js

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`
- Modify: `.env.local` (add placeholder vars)

**Step 1: Install next-axiom**

Run: `npm install next-axiom`

**Step 2: Wrap next.config.ts with withAxiom**

```ts
import type { NextConfig } from "next";
import { withAxiom } from "next-axiom";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default withAxiom(nextConfig);
```

**Step 3: Add env vars to .env.local**

Add these (values come from Axiom dashboard):
```
NEXT_PUBLIC_AXIOM_DATASET=stocktracker
NEXT_PUBLIC_AXIOM_TOKEN=your-axiom-token
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds without errors.

**Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts
git commit -m "feat: install next-axiom and configure Next.js integration"
```

---

### Task 2: Create logger abstraction layer — types and console provider

**Files:**
- Create: `src/lib/logger/types.ts`
- Create: `src/lib/logger/providers/console.ts`
- Create: `src/lib/logger/providers/axiom.ts`
- Create: `src/lib/logger/index.ts`

**Step 1: Create types.ts**

```ts
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}
```

**Step 2: Create console provider (dev fallback)**

```ts
import type { Logger, LogContext, LogLevel } from "../types";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class ConsoleLogger implements Logger {
  private context: LogContext;
  private minLevel: LogLevel;

  constructor(context: LogContext = {}, minLevel?: LogLevel) {
    this.context = context;
    this.minLevel = minLevel ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  child(context: LogContext): Logger {
    return new ConsoleLogger({ ...this.context, ...context }, this.minLevel);
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...context,
    };

    const method = level === "debug" ? "log" : level;
    console[method](JSON.stringify(entry));
  }
}

export function createConsoleLogger(context?: LogContext): Logger {
  return new ConsoleLogger(context);
}
```

**Step 3: Create axiom provider**

```ts
import { Logger as AxiomLogger } from "next-axiom";
import type { Logger, LogContext } from "../types";

export class AxiomLoggerAdapter implements Logger {
  private axiom: AxiomLogger;
  private context: LogContext;

  constructor(axiom?: AxiomLogger, context: LogContext = {}) {
    this.axiom = axiom ?? new AxiomLogger();
    this.context = context;
  }

  debug(message: string, context?: LogContext): void {
    this.axiom.debug(message, { ...this.context, ...context });
  }

  info(message: string, context?: LogContext): void {
    this.axiom.info(message, { ...this.context, ...context });
  }

  warn(message: string, context?: LogContext): void {
    this.axiom.warn(message, { ...this.context, ...context });
  }

  error(message: string, context?: LogContext): void {
    this.axiom.error(message, { ...this.context, ...context });
  }

  child(context: LogContext): Logger {
    return new AxiomLoggerAdapter(
      this.axiom.with({ ...this.context, ...context }),
      { ...this.context, ...context }
    );
  }
}

export function createAxiomLogger(context?: LogContext): Logger {
  return new AxiomLoggerAdapter(undefined, context);
}
```

**Step 4: Create index.ts (public API)**

```ts
export type { Logger, LogContext, LogLevel } from "./types";

// --- Provider selection ---
// To swap providers, change this import to a different provider.
// e.g., import { createConsoleLogger as createProvider } from "./providers/console";
import { createAxiomLogger as createProvider } from "./providers/axiom";
import { createConsoleLogger } from "./providers/console";
import type { LogContext } from "./types";

const isAxiomConfigured =
  typeof process !== "undefined" &&
  !!process.env.NEXT_PUBLIC_AXIOM_DATASET;

export function createLogger(context?: LogContext) {
  return isAxiomConfigured ? createProvider(context) : createConsoleLogger(context);
}

export const logger = createLogger();
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/lib/logger/
git commit -m "feat: add logger abstraction layer with Axiom and console providers"
```

---

### Task 3: Instrument middleware and auth callback

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/lib/supabase/middleware.ts`
- Modify: `src/app/auth/callback/route.ts`

**Step 1: Update src/middleware.ts — wrap with withAxiom**

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { withAxiom } from "next-axiom";

export const middleware = withAxiom(async function middleware(request: NextRequest) {
  return await updateSession(request);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

**Step 2: Add logging to src/lib/supabase/middleware.ts**

Add logging for unauthorized redirects. Add at the top:
```ts
import { createLogger } from "@/lib/logger";
```

Create logger after user check (after line 30):
```ts
const log = createLogger({ service: "auth-middleware" });
```

Before the redirect to `/login` (before line 39), add:
```ts
log.warn("Unauthorized access, redirecting to login", {
  path: request.nextUrl.pathname,
});
```

**Step 3: Add logging to auth callback**

Replace `src/app/auth/callback/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "auth-callback" });

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      log.info("Auth callback successful", {
        email: data.user?.email ? maskEmail(data.user.email) : undefined,
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
    log.error("Auth code exchange failed", {
      error: error.message,
      code: error.status,
    });
  } else {
    log.warn("Auth callback called without code");
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/middleware.ts src/lib/supabase/middleware.ts src/app/auth/callback/route.ts
git commit -m "feat: add logging to middleware and auth callback"
```

---

### Task 4: Instrument API routes — cron, import, upload

**Files:**
- Modify: `src/app/api/cron/refresh-prices/route.ts`
- Modify: `src/app/api/import/route.ts`
- Modify: `src/app/api/upload/route.ts`

**Step 1: Update cron refresh-prices route**

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices, isIndianTradingHours } from "@/lib/services/price-refresh";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger({ service: "cron", job: "refresh-prices" });

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    log.warn("Cron unauthorized access attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isIndianTradingHours()) {
    log.info("Cron skipped — outside trading hours");
    return NextResponse.json({ skipped: true, reason: "Outside Indian trading hours" });
  }

  const start = Date.now();
  try {
    const adminClient = createAdminClient();
    const result = await refreshPrices(adminClient);
    log.info("Cron completed", {
      ...result,
      duration_ms: Date.now() - start,
    });
    return NextResponse.json(result);
  } catch (error) {
    log.error("Cron failed", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration_ms: Date.now() - start,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

**Step 2: Update import route**

Add at top of `src/app/api/import/route.ts`:
```ts
import { createLogger } from "@/lib/logger";
```

Add after imports:
```ts
const log = createLogger({ service: "import" });
```

After `const companies = parseExcel(buffer);` add:
```ts
log.info("Excel parsed", { fileName: file.name, fileSize: file.size, companiesFound: companies.length });
```

Inside the `for` loop, after `imported++;` add:
```ts
log.info("Company imported", { name: c.name, isin });
```

In the catch block, replace the `errors.push(...)` with:
```ts
const errMsg = (err as Error).message;
errors.push(`${c.name}: ${errMsg}`);
log.error("Company import failed", { name: c.name, symbol: c.symbol, error: errMsg });
```

Before the final `return`, add:
```ts
log.info("Import completed", {
  imported,
  total: companies.length,
  failed: errors.length,
  duration_ms: Date.now() - start,
});
```

Also add `const start = Date.now();` right after the auth check on line 9.

**Step 3: Update upload route**

Add at top of `src/app/api/upload/route.ts`:
```ts
import { createLogger } from "@/lib/logger";
```

Add after imports:
```ts
const log = createLogger({ service: "upload" });
```

Replace the catch block's `console.error` with:
```ts
log.error("Upload failed", {
  error: err instanceof Error ? err.message : String(err),
  fileName: file.name,
  fileSize: file.size,
  contentType,
  companyId,
});
```

After the successful `return NextResponse.json(...)` (before it), add:
```ts
log.info("Upload successful", {
  fileName: file.name,
  fileSize: file.size,
  contentType,
  path,
});
```

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: add structured logging to API routes (cron, import, upload)"
```

---

### Task 5: Instrument server actions — company and portfolio

**Files:**
- Modify: `src/app/(authenticated)/actions/company-actions.ts`
- Modify: `src/app/(authenticated)/actions/portfolio-actions.ts`

**Step 1: Add logging to company-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "company-actions" });
```

Add logging to each function. Pattern for mutating actions (create, update, delete):
- Log error before throwing: `log.error("createCompany failed", { error: error.message });`
- Log success after mutation: `log.info("Company created", { portfolioId });`

For `getCompanies` and `getCompany` — only log errors (not reads):
- Before `throw`: `log.error("getCompanies failed", { error: error.message, portfolioId });`

For `deleteCompany`:
- Before throw: `log.error("deleteCompany failed", { companyId: id, error: error.message });`
- After success: `log.info("Company deleted", { companyId: id });`

For `deleteAllCompanies`:
- Before throw: `log.error("deleteAllCompanies failed", { error: error.message });`
- After success: `log.warn("All companies deleted by user");`

For `getLivePrices`:
- Before throw: `log.error("getLivePrices failed", { error: error.message });`

**Step 2: Add logging to portfolio-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "portfolio-actions" });
```

Same pattern:
- `createPortfolio`: log error + success with portfolio name
- `getPortfolios`: log error only
- `ensureDefaultPortfolio`: log error + log when creating new default portfolio

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/\(authenticated\)/actions/company-actions.ts src/app/\(authenticated\)/actions/portfolio-actions.ts
git commit -m "feat: add logging to company and portfolio server actions"
```

---

### Task 6: Instrument server actions — financial, valuation, timeline

**Files:**
- Modify: `src/app/(authenticated)/actions/financial-actions.ts`
- Modify: `src/app/(authenticated)/actions/valuation-actions.ts`
- Modify: `src/app/(authenticated)/actions/timeline-actions.ts`

**Step 1: Add logging to financial-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "financial-actions" });
```

- `upsertFinancialYear`: log error with companyId + year, log success
- `bulkUpsertFinancialYears`: log error with companyId + count, log success with row count and horizon

**Step 2: Add logging to valuation-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "valuation-actions" });
```

- `upsertValuation`: log error with companyId + scenario_type, log success

**Step 3: Add logging to timeline-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "timeline-actions" });
```

- `createTimelineEntry`: log error + success with companyId
- `updateTimelineEntry`: log error + success with entryId, companyId
- `deleteTimelineEntry`: log error + success with entryId, companyId

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/\(authenticated\)/actions/financial-actions.ts src/app/\(authenticated\)/actions/valuation-actions.ts src/app/\(authenticated\)/actions/timeline-actions.ts
git commit -m "feat: add logging to financial, valuation, and timeline server actions"
```

---

### Task 7: Instrument server actions — stock, price, projection

**Files:**
- Modify: `src/app/(authenticated)/actions/stock-actions.ts`
- Modify: `src/app/(authenticated)/actions/price-actions.ts`
- Modify: `src/app/(authenticated)/actions/projection-actions.ts`

**Step 1: Add logging to stock-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "stock-actions" });
```

- `searchStocks`: log error only (reads are noisy)
- `getStockByIsin`: log error only

**Step 2: Add logging to price-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "price-actions" });
```

- `manualRefreshPrices`: Replace `console.error` with `log.error`. Add `log.info` at end with result summary (updated, failed, total, duration_ms).

**Step 3: Add logging to projection-actions.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "projection-actions" });
```

- `createProjectionModel`: log error + success with companyId, projectionType, isDefault
- `deleteProjectionModel`: log error + success with modelId, companyId
- `setDefaultProjectionModel`: log error + success with companyId, modelId
- `saveAllProjections`: log error with companyId + which upsert failed, log success with companyId + model count

**Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 5: Commit**

```bash
git add src/app/\(authenticated\)/actions/stock-actions.ts src/app/\(authenticated\)/actions/price-actions.ts src/app/\(authenticated\)/actions/projection-actions.ts
git commit -m "feat: add logging to stock, price, and projection server actions"
```

---

### Task 8: Instrument services and providers

**Files:**
- Modify: `src/lib/services/price-refresh.ts`
- Modify: `src/lib/providers/stock-price/yahoo-finance-provider.ts`
- Modify: `src/lib/providers/stock-price/twelve-data-provider.ts`
- Modify: `src/lib/providers/storage/supabase-storage.ts`

**Step 1: Update price-refresh.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "price-refresh" });
```

- At start of `refreshPrices`: `log.info("Price refresh started", { totalSymbols: uniqueSymbols.length });`
- Replace `console.error` with `log.error("Failed to update stock", { symbol, isin, error: updateError.message });`
- At end before return: `log.info("Price refresh completed", { updated, failed, totalSymbols: uniqueSymbols.length });`

**Step 2: Update yahoo-finance-provider.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "stock-price", provider: "yahoo-finance" });
```

- Replace `console.warn` on line 51 with: `log.warn("Batch fetch failed, falling back to individual", { batchSize: batch.length, error: error instanceof Error ? error.message : String(error) });`
- Replace `console.warn` on line 57 with: `log.warn("Individual fetch failed", { symbol, error: e instanceof Error ? e.message : String(e) });`
- After `fetchBulkQuotes` completes (before return): `log.info("Bulk quotes fetched", { requested: symbols.length, received: results.size });`

**Step 3: Update twelve-data-provider.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "stock-price", provider: "twelve-data" });
```

- Replace `console.error` on line 39 with: `log.error("API request failed", { status: response.status, statusText: response.statusText, batchSize: batch.length });`
- Replace `console.warn` on line 77 with: `log.warn("No data for symbol", { symbol: originalSymbol });`
- After `fetchBulkQuotes` return: `log.info("Bulk quotes fetched", { requested: symbols.length, received: results.size });`

**Step 4: Update supabase-storage.ts**

Add at top:
```ts
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "storage", provider: "supabase" });
```

- In `upload`, before throw: `log.error("Upload failed", { path, contentType, error: error.message });`
- After success: `log.info("File uploaded", { path, size: file.byteLength, contentType });`
- In `delete`, before throw: `log.error("Delete failed", { path, error: error.message });`

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/lib/services/price-refresh.ts src/lib/providers/stock-price/ src/lib/providers/storage/supabase-storage.ts
git commit -m "feat: add logging to price refresh service, stock price providers, and storage"
```

---

### Task 9: Final verification and cleanup

**Files:**
- None new — verification only

**Step 1: Verify no remaining console.log/error/warn calls**

Run: `grep -rn "console\.\(log\|error\|warn\|info\|debug\)" src/`
Expected: Zero matches (all replaced with structured logger).

**Step 2: Full build check**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 3: Verify lint**

Run: `npm run lint`
Expected: No new lint errors.

**Step 4: Manual smoke test (dev)**

Run: `npm run dev`
- Navigate to the app in browser
- Check terminal for structured JSON log output from console provider
- Verify auth redirect produces a log line
- Verify any server action produces a log line

**Step 5: Commit any cleanup**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "chore: clean up remaining console statements, final logging verification"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Install next-axiom, configure Next.js | 2 |
| 2 | Logger abstraction (types, console, axiom, index) | 4 new |
| 3 | Middleware + auth callback logging | 3 |
| 4 | API routes logging (cron, import, upload) | 3 |
| 5 | Server actions: company + portfolio | 2 |
| 6 | Server actions: financial + valuation + timeline | 3 |
| 7 | Server actions: stock + price + projection | 3 |
| 8 | Services + providers (price refresh, yahoo, twelve data, storage) | 4 |
| 9 | Final verification + cleanup | 0 |

**Total: ~4 new files, ~18 modified files, 9 commits**
