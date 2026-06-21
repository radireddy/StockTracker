# Production-Grade Logging Design

**Date:** 2026-06-21
**Status:** Approved
**Goal:** Fast troubleshooting, debugging, and future alerting capability

## Decision

- **Tool:** next-axiom (Axiom's Next.js SDK)
- **Abstraction:** Custom Logger interface so provider can be swapped without touching application code
- **Dev fallback:** Structured console provider for local development

## Architecture

```
Application Code (server actions, API routes, middleware)
        │
        │  import { logger } from '@/lib/logger'
        ▼
   src/lib/logger/index.ts  (public API)
        │
        ▼
   src/lib/logger/providers/
   ├── axiom.ts       ← production (next-axiom)
   └── console.ts     ← dev fallback
```

Swapping providers = change one re-export in `index.ts`. Application code never imports from a provider directly.

## Logger Interface

```ts
interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}
```

`child()` creates scoped loggers that carry context (e.g., service, symbol) on all subsequent logs.

## Log Levels

| Level | When |
|-------|------|
| debug | Detailed dev troubleshooting (off in prod by default) |
| info  | Normal operations — action invoked, job completed |
| warn  | Recoverable issues — fallback triggered, partial failure |
| error | Failures — DB errors, API failures, unhandled exceptions |

## Logging Coverage by Layer

### API Routes (3 files)
- Request start/end with duration
- Error with full context and stack trace
- Wrapped via next-axiom's `withAxiom`

### Server Actions (8 files)
- Action invoked with key params
- Success with result summary
- Failure with error and params

### Authentication (2 files)
- Auth callback success/failure with masked email
- Middleware unauthorized redirects, session refresh failures

### External APIs — Stock Price Providers (2 files)
- Request: provider, symbols, batch size
- Response: success/failure count, duration
- Fallback events

### Background Jobs — Cron (1 file)
- Job start/end/skip with reason
- Summary: updated, failed, total, duration

### Import/Upload (2 files)
- Import start with file info
- Per-company success/failure
- Import summary with duration

### File Storage (1 file)
- Upload success/failure with file context

## Structured Log Format

Every log entry includes:

```json
{
  "level": "error",
  "message": "Failed to update stock price",
  "service": "price-refresh",
  "symbol": "RELIANCE",
  "provider": "yahoo-finance",
  "duration_ms": 1230,
  "error": "timeout",
  "timestamp": "2026-06-21T10:30:00Z"
}
```

## New Files

```
src/lib/logger/
├── index.ts              # Public API
├── types.ts              # Logger interface, LogLevel, LogContext
├── providers/
│   ├── axiom.ts          # next-axiom provider (production)
│   └── console.ts        # Structured console provider (dev)
└── middleware.ts          # withLogging() wrapper for API routes
```

## Modified Files (19 total)

**API Routes:**
- src/app/api/cron/refresh-prices/route.ts
- src/app/api/import/route.ts
- src/app/api/upload/route.ts

**Server Actions:**
- src/app/(authenticated)/actions/company-actions.ts
- src/app/(authenticated)/actions/portfolio-actions.ts
- src/app/(authenticated)/actions/financial-actions.ts
- src/app/(authenticated)/actions/valuation-actions.ts
- src/app/(authenticated)/actions/timeline-actions.ts
- src/app/(authenticated)/actions/stock-actions.ts
- src/app/(authenticated)/actions/price-actions.ts
- src/app/(authenticated)/actions/projection-actions.ts

**Auth:**
- src/app/auth/callback/route.ts
- src/lib/supabase/middleware.ts

**Services & Providers:**
- src/lib/services/price-refresh.ts
- src/lib/providers/stock-price/yahoo-finance-provider.ts
- src/lib/providers/stock-price/twelve-data-provider.ts
- src/lib/providers/storage/supabase-storage.ts

**Config:**
- next.config.ts — wrap with withAxiom()
- src/middleware.ts — wrap with withAxiom

## Axiom Setup

1. Install `next-axiom`
2. Create Axiom dataset: `stocktracker`
3. Env vars: `NEXT_PUBLIC_AXIOM_TOKEN`, `NEXT_PUBLIC_AXIOM_DATASET`
4. Wrap `next.config.ts` with `withAxiom()`

## Alerting Foundation

Structured logs enable Axiom monitors (configured in dashboard, not code):
- `level=error AND service=price-refresh` count > 5 in 10min
- `level=error AND service=auth` count > 0
- `service=cron AND duration_ms > 30000`

## Constraints

- No sensitive data in logs (no tokens, passwords, full user objects)
- Email addresses masked in auth logs
- Debug level disabled in production by default
- Provider-agnostic: swapping Axiom for Pino/Datadog = one file change
