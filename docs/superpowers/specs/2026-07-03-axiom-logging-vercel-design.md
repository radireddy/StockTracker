# Axiom logging on Vercel — Design

**Date:** 2026-07-03
**Status:** Approved for planning
**Author:** ravindra adireddy (with Claude)

## Goal

Make application logs actually flow from the StockTracker Next.js app running on
Vercel into an Axiom dataset, using the `next-axiom` SDK path. Server-side only.

## Context: what already exists

The code-level integration was scaffolded earlier and is essentially complete:

- `next-axiom@1.10.0` is installed.
- `next.config.ts` wraps config with `withAxiom(...)` (build-time plugin: adds
  the `/_axiom` rewrites + webpack handling).
- `src/proxy.ts` (Next 16 middleware) wraps the handler with `withAxiom(...)`,
  which auto-flushes middleware logs.
- `src/lib/logger/` is a provider abstraction (`types.ts`, `index.ts`,
  `providers/console.ts`, `providers/axiom.ts`) that auto-selects the Axiom
  provider when configured, else the console provider.
- The logger is adopted across the app: every server action
  (`src/app/(authenticated)/actions/*.ts`), API route
  (`src/app/api/*/route.ts`, `src/app/auth/callback/route.ts`), providers
  (`src/lib/providers/**`), and error boundaries.
- Unit tests exist for both providers and the selector.

So there is **no new logging code to write for adoption**. The work is (a) fixing
a reliability gap that would otherwise silently drop nearly all logs on Vercel,
(b) choosing secure env vars, and (c) the account/Vercel setup runbook.

## The core problem: logs are dropped on Vercel without an explicit flush

`next-axiom`'s `Logger` buffers events and sends them on a **trailing 1-second
timer** — `throttledSendLogs = throttle(this.sendLogs, 1000)` (`logger.js:20`),
and `throttle` schedules a `setTimeout(..., 1000)` (verified in `shared.js:106`).
It never sends synchronously.

On Vercel, a serverless/edge function is frozen (execution suspended) immediately
after it returns its response. The pending 1-second `setTimeout` never runs, so
the buffered logs are **never sent**.

`withAxiom` auto-flushes only the constructs it wraps:
- Middleware — handled (`proxy.ts` is wrapped) ✅
- Route handlers wrapped with the route `withAxiom` — **not used here** ❌
- Server actions — **not covered by `withAxiom` at all** ❌

Our route handlers use plain `export async function GET/POST(...)` and our server
actions use module-scoped `const log = createLogger({ service })`. Nothing flushes
them. Result without a fix: middleware logs appear in Axiom; virtually all server
action and API route logs (including error logs) are lost.

## Decisions

1. **Integration path:** `next-axiom` SDK (app ships logs directly to Axiom),
   not the Vercel Log Drain marketplace integration.
2. **Scope:** server-side only (server actions, route handlers, middleware,
   provider modules). No client-side browser logging / Web Vitals.
3. **Env vars:** use the **non-public** `AXIOM_TOKEN` + `AXIOM_DATASET` (which
   `next-axiom`'s generic config reads — see `platform/generic.js`), NOT the
   `NEXT_PUBLIC_*` variants. Because scope is server-side only, this keeps the
   Axiom ingest token out of the client JS bundle.
4. **Flush strategy:** `after(() => log.flush())` from `next/server` — flush is
   scheduled to run after the response is sent; Vercel keeps the function alive
   for `after()` callbacks. Stable in Next 16. Non-blocking, ~one line per
   handler.

## Changes

### 1. Logger interface: add `flush()`

`src/lib/logger/types.ts` — add to the `Logger` interface:

```ts
flush(): Promise<void>;
```

- `src/lib/logger/providers/axiom.ts` — implement `flush()` delegating to the
  underlying `next-axiom` logger: `await this.axiom.flush()`. `child()` returns
  an adapter around `this.axiom.with(...)`; that child shares the parent's flush
  chain (`next-axiom` flushes children too), so flushing the root is sufficient.
- `src/lib/logger/providers/console.ts` — implement `flush()` as a no-op
  (`async flush() {}`).

### 2. Fix the config gate to detect non-public env

`src/lib/logger/index.ts:10` currently:

```ts
const isAxiomConfigured =
  typeof process !== "undefined" &&
  !!process.env.NEXT_PUBLIC_AXIOM_DATASET;
```

Since we use the non-public `AXIOM_DATASET`, this must accept either, or the
selector silently falls back to console on the server:

```ts
const isAxiomConfigured =
  typeof process !== "undefined" &&
  !!(process.env.AXIOM_DATASET || process.env.NEXT_PUBLIC_AXIOM_DATASET);
```

(Keeping `NEXT_PUBLIC_*` in the check preserves a future client-logging option
without another change here.)

### 3. Flush at the end of the request lifecycle

Add `import { after } from "next/server";` and, at the start of each exported
server action and route handler, register:

```ts
after(() => log.flush());
```

`after()` registers a callback for the current request scope; the module-scoped
`log` is fine to flush from there. Files:

Server actions (`src/app/(authenticated)/actions/`):
`portfolio-actions.ts`, `stock-actions.ts`, `financial-actions.ts`,
`projection-actions.ts`, `valuation-actions.ts`, `price-actions.ts`,
`pnl-actions.ts`, `timeline-actions.ts`, `holdings-actions.ts`,
`account-actions.ts`, `company-actions.ts` — one `after(() => log.flush())` at
the top of each exported action.

Route handlers: `src/app/api/dashboard/route.ts` (GET),
`src/app/api/import/route.ts` (GET + POST), `src/app/api/upload/route.ts` (POST),
`src/app/auth/callback/route.ts` (GET).

Note on shared buffers: module-scoped loggers are shared across concurrent
requests, so an `after()` flush may send events buffered by another in-flight
request. This does not lose logs (delivery still happens); it only means a log
may be delivered slightly earlier by a neighboring request's flush. Acceptable.

### 4. `.env.local.example`

Append:

```
# Axiom logging (server-side only). Leave unset to log to console.
AXIOM_DATASET=your-axiom-dataset
AXIOM_TOKEN=your-axiom-api-token
```

### 5. Setup runbook (documented in this spec; performed by the user)

1. Create an Axiom account at https://app.axiom.co and an org.
2. Create a **dataset** (e.g. `stocktracker`). Copy its name.
3. Create an **API token** (Settings → API tokens) with **ingest** permission
   scoped to that dataset. Copy the token (shown once).
4. Local: put `AXIOM_DATASET` and `AXIOM_TOKEN` in `.env.local`, run `npm run dev`,
   trigger an action, and confirm events appear in the Axiom dataset stream.
5. Vercel: Project → Settings → Environment Variables → add `AXIOM_DATASET` and
   `AXIOM_TOKEN` for Production (and Preview if desired). These are **not**
   `NEXT_PUBLIC_`, so they stay server-only.
6. Redeploy. Exercise the app, then confirm logs in Axiom, filtering by the
   `service` field (e.g. `service == "holdings-actions"`) and `vercel.*`
   metadata that `next-axiom` attaches automatically on Vercel.

## Testing

Extend the existing Vitest suites in `src/__tests__/lib/logger/`:

- Axiom provider: `flush()` calls the underlying logger's `flush()`; `child()`
  returns an adapter whose logs are covered by the root flush.
- Console provider: `flush()` resolves and is a no-op.
- Selector (`index.test.ts`): Axiom provider is chosen when `AXIOM_DATASET`
  (non-public) is set, and when `NEXT_PUBLIC_AXIOM_DATASET` is set; console
  provider when neither is set.

Full run of `npm test`, `npm run lint`, and `npm run build` must pass (matches the CI
gate). Coverage thresholds (95%) must hold.

## Non-goals / known limitations

- **Client-side logging is out of scope.** The error boundaries
  (`src/app/error.tsx`, `src/app/(authenticated)/error.tsx`,
  `src/app/global-error.tsx`) are Client Components. With server-side-only env
  vars, `isAxiomConfigured` is false in the browser, so they log to the browser
  console only — those render-error events will **not** reach Axiom. This is an
  accepted trade-off of avoiding a public ingest token in the client bundle.
  Future options if needed: (a) client logging with a `NEXT_PUBLIC_*` token, or
  (b) a small server route the boundaries POST to, which logs server-side.
- No log-drain / platform-log ingestion (build logs, raw function stdout).
- No changes to log levels, redaction, or the error-handling convention
  (`describeDbError`, `ActionResult`) — those stay as-is.
