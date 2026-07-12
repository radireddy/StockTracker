# Allocation Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/allocation-calculator` page with an interactive conviction-bucket calculator and a post-result marketing pitch for unauthenticated users.

**Architecture:** Pure client-side calculation utility extracted to `src/lib/utils/allocation-calculator.ts` (unit-tested) feeds a `"use client"` React component that owns all form state, auth detection, and marketing pitch rendering. The Next.js page file at `src/app/(marketing)/allocation-calculator/page.tsx` is a static SSG shell with full metadata, JSON-LD, and a FAQ section for SEO. Three existing files receive small additions: `SiteHeader` (nav link), `sitemap.ts` (URL), and `sub-page-shell.tsx` (cross-links).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest (unit tests), Supabase browser client (auth detection), existing `@/components/ui/input` + `@/components/ui/button` components.

## Global Constraints

- No currency symbols (₹) anywhere in calculator output — numbers only formatted with `en-IN` locale via `fmtAmountShort` from `@/lib/utils/calculations`.
- Default allocation ranges must match `DEFAULT_ALLOCATION_RANGES` from `@/types/database`: 4★ 6–8%, 3★ 4–6%, 2★ 2–4%, 1★ 0–2%.
- Calculator results reset (hidden) whenever any input changes — user must click "Calculate allocation" again.
- Marketing pitch renders only for unauthenticated users (Supabase session null), checked on mount.
- All new `src/lib/**/*.ts` files are subject to the 95% coverage threshold enforced by `vitest.config.ts`.
- No new dependencies — use only packages already in the project.
- Test command: `npm test` (runs all tests) or `npx vitest run src/__tests__/lib/allocation-calculator.test.ts` (single file).

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/utils/allocation-calculator.ts` | Pure calculation logic — types + `calculate()` |
| Create | `src/__tests__/lib/allocation-calculator.test.ts` | Unit tests for the utility |
| Create | `src/components/marketing/allocation-calculator.tsx` | `"use client"` form + results + pitch |
| Create | `src/app/(marketing)/allocation-calculator/page.tsx` | SSG page — metadata, JSON-LD, layout |
| Modify | `src/components/marketing/site-header.tsx` | Add "Calculator" nav link |
| Modify | `src/app/sitemap.ts` | Add `/allocation-calculator` |
| Modify | `src/components/marketing/sub-page-shell.tsx` | Add to `ALL` cross-links array |

---

## Task 1: Nav link, sitemap, cross-links

**Files:**
- Modify: `src/components/marketing/site-header.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/components/marketing/sub-page-shell.tsx`

**Interfaces:**
- Produces: `/allocation-calculator` is reachable via the marketing header on every page and appears in `sitemap.xml`.

- [ ] **Step 1: Add Calculator link to SiteHeader**

Open `src/components/marketing/site-header.tsx`. After the existing "Features" `<Link>` and before `<MarketingThemeSwitcher />`, insert:

```tsx
<Link
  href="/allocation-calculator"
  className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
>
  Calculator
</Link>
```

The file after the change (relevant section only):
```tsx
<div className="flex items-center gap-3">
  <Link
    href={home ? "#features" : "/#features"}
    className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
  >
    Features
  </Link>
  <Link
    href="/allocation-calculator"
    className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
  >
    Calculator
  </Link>
  <MarketingThemeSwitcher />
  <GoogleCta className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
    Sign in
  </GoogleCta>
</div>
```

- [ ] **Step 2: Add /allocation-calculator to sitemap**

Open `src/app/sitemap.ts`. Add `"/allocation-calculator"` to the `pages` array:

```ts
const pages = [
  "/allocation-calculator",
  "/zerodha-portfolio-tracker",
  "/intrinsic-value-margin-of-safety",
  "/portfolio-allocation",
  "/watchlist-buy-signal",
  "/quarterly-earnings-timeline",
  "/stock-research-organizer",
  "/stock-valuation-model",
  "/family-portfolio-multiple-demat",
  "/stock-portfolio-excel-alternative",
  "/living-research-report",
];
```

- [ ] **Step 3: Add to sub-page-shell cross-links**

Open `src/components/marketing/sub-page-shell.tsx`. Add to the `ALL` array (alphabetical position doesn't matter, add near the top):

```ts
const ALL = [
  { href: "/allocation-calculator", label: "Stock allocation calculator" },
  {
    href: "/research-advisory-portfolio-tracker",
    label: "Research advisory portfolio tracker",
  },
  // ... rest of existing entries unchanged
```

- [ ] **Step 4: Commit**

```bash
git add src/components/marketing/site-header.tsx src/app/sitemap.ts src/components/marketing/sub-page-shell.tsx
git commit -m "feat(nav): add allocation calculator link, sitemap entry, cross-links"
```

---

## Task 2: Calculation utility (TDD)

**Files:**
- Create: `src/lib/utils/allocation-calculator.ts`
- Create: `src/__tests__/lib/allocation-calculator.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  export type Star = 1 | 2 | 3 | 4;

  export type StarRange = { min: number; max: number };

  export type StarInput = { star: Star; count: number; range: StarRange };

  export type BucketResult = {
    star: Star;
    count: number;
    range: StarRange;
    perStockMin: number;
    perStockMax: number;
    bucketMin: number;
    bucketMax: number;
    isAbsolute: boolean;   // true when min === max
    hasRangeError: boolean; // true when min > max
  };

  export type CalculatorResult = {
    buckets: BucketResult[];        // only buckets where count > 0
    totalAmount: number;
    totalDeployedMin: number;
    totalDeployedMax: number;
    cashBufferMin: number;
    cashBufferMax: number;
    isOverAllocated: boolean;
    isFullyDeployed: boolean;
  };

  export function calculate(totalAmount: number, inputs: StarInput[]): CalculatorResult
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/allocation-calculator.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calculate } from "@/lib/utils/allocation-calculator";
import type { StarInput } from "@/lib/utils/allocation-calculator";

function input(star: 1 | 2 | 3 | 4, count: number, min: number, max: number): StarInput {
  return { star, count, range: { min, max } };
}

describe("calculate", () => {
  it("returns single bucket with correct per-stock and bucket amounts", () => {
    const result = calculate(1_000_000, [input(4, 2, 6, 8)]);
    const bucket = result.buckets[0];
    expect(bucket.star).toBe(4);
    expect(bucket.count).toBe(2);
    expect(bucket.perStockMin).toBeCloseTo(60_000);
    expect(bucket.perStockMax).toBeCloseTo(80_000);
    expect(bucket.bucketMin).toBeCloseTo(120_000);
    expect(bucket.bucketMax).toBeCloseTo(160_000);
    expect(bucket.isAbsolute).toBe(false);
    expect(bucket.hasRangeError).toBe(false);
  });

  it("excludes buckets where count is 0", () => {
    const result = calculate(1_000_000, [
      input(4, 0, 6, 8),
      input(3, 2, 4, 6),
    ]);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].star).toBe(3);
  });

  it("sums totalDeployedMin and totalDeployedMax across active buckets", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 6, 8), // bucket: 120k–160k
      input(3, 3, 4, 6), // bucket: 120k–180k
    ]);
    expect(result.totalDeployedMin).toBeCloseTo(240_000);
    expect(result.totalDeployedMax).toBeCloseTo(340_000);
  });

  it("computes cashBufferMin and cashBufferMax correctly", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 6, 8), // bucket: 120k–160k
    ]);
    // cashBufferMin = max(0, 1M - 160k) = 840k
    expect(result.cashBufferMin).toBeCloseTo(840_000);
    // cashBufferMax = max(0, 1M - 120k) = 880k
    expect(result.cashBufferMax).toBeCloseTo(880_000);
  });

  it("sets isOverAllocated when totalDeployedMax exceeds totalAmount", () => {
    // 15 four-star stocks at 8% max = 120% of portfolio
    const result = calculate(1_000_000, [input(4, 15, 6, 8)]);
    expect(result.isOverAllocated).toBe(true);
  });

  it("does not set isOverAllocated when targets fit within total", () => {
    const result = calculate(1_000_000, [input(4, 2, 6, 8)]);
    expect(result.isOverAllocated).toBe(false);
  });

  it("floors cashBufferMin at 0 when over-allocated", () => {
    const result = calculate(1_000_000, [input(4, 15, 6, 8)]);
    expect(result.cashBufferMin).toBe(0);
  });

  it("sets isFullyDeployed when all cash is exactly allocated", () => {
    // 10 stocks at exactly 10% each (absolute) = 100% total
    const result = calculate(1_000_000, [
      input(4, 5, 10, 10),
      input(3, 5, 10, 10),
    ]);
    expect(result.isFullyDeployed).toBe(true);
    expect(result.cashBufferMin).toBe(0);
    expect(result.cashBufferMax).toBe(0);
  });

  it("marks isAbsolute true when min equals max", () => {
    const result = calculate(1_000_000, [input(4, 1, 8, 8)]);
    expect(result.buckets[0].isAbsolute).toBe(true);
  });

  it("marks hasRangeError true and excludes bucket from totals when min > max", () => {
    const result = calculate(1_000_000, [
      input(4, 2, 8, 6), // invalid: min 8 > max 6
      input(3, 2, 4, 6), // valid
    ]);
    const errorBucket = result.buckets.find((b) => b.star === 4)!;
    const validBucket = result.buckets.find((b) => b.star === 3)!;

    expect(errorBucket.hasRangeError).toBe(true);
    expect(errorBucket.perStockMin).toBe(0);
    expect(errorBucket.perStockMax).toBe(0);
    expect(errorBucket.bucketMin).toBe(0);
    expect(errorBucket.bucketMax).toBe(0);

    // Only the valid bucket contributes to totals
    expect(result.totalDeployedMin).toBeCloseTo(validBucket.bucketMin);
    expect(result.totalDeployedMax).toBeCloseTo(validBucket.bucketMax);
  });

  it("returns buckets ordered by star descending (4 first)", () => {
    const result = calculate(1_000_000, [
      input(1, 1, 0, 2),
      input(4, 1, 6, 8),
      input(3, 1, 4, 6),
    ]);
    expect(result.buckets.map((b) => b.star)).toEqual([4, 3, 1]);
  });

  it("returns empty buckets array when all counts are 0", () => {
    const result = calculate(1_000_000, [input(4, 0, 6, 8)]);
    expect(result.buckets).toHaveLength(0);
    expect(result.totalDeployedMin).toBe(0);
    expect(result.totalDeployedMax).toBe(0);
    expect(result.cashBufferMin).toBeCloseTo(1_000_000);
    expect(result.cashBufferMax).toBeCloseTo(1_000_000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lib/allocation-calculator.test.ts
```

Expected: all tests FAIL with `Cannot find module '@/lib/utils/allocation-calculator'`.

- [ ] **Step 3: Implement the calculation utility**

Create `src/lib/utils/allocation-calculator.ts`:

```typescript
export type Star = 1 | 2 | 3 | 4;

export type StarRange = { min: number; max: number };

export type StarInput = {
  star: Star;
  count: number;
  range: StarRange;
};

export type BucketResult = {
  star: Star;
  count: number;
  range: StarRange;
  perStockMin: number;
  perStockMax: number;
  bucketMin: number;
  bucketMax: number;
  isAbsolute: boolean;
  hasRangeError: boolean;
};

export type CalculatorResult = {
  buckets: BucketResult[];
  totalAmount: number;
  totalDeployedMin: number;
  totalDeployedMax: number;
  cashBufferMin: number;
  cashBufferMax: number;
  isOverAllocated: boolean;
  isFullyDeployed: boolean;
};

export function calculate(totalAmount: number, inputs: StarInput[]): CalculatorResult {
  const active = inputs
    .filter((i) => i.count > 0)
    .sort((a, b) => b.star - a.star);

  const buckets: BucketResult[] = active.map((input) => {
    const hasRangeError = input.range.min > input.range.max;
    const perStockMin = hasRangeError ? 0 : (input.range.min / 100) * totalAmount;
    const perStockMax = hasRangeError ? 0 : (input.range.max / 100) * totalAmount;
    return {
      star: input.star,
      count: input.count,
      range: input.range,
      perStockMin,
      perStockMax,
      bucketMin: input.count * perStockMin,
      bucketMax: input.count * perStockMax,
      isAbsolute: !hasRangeError && input.range.min === input.range.max,
      hasRangeError,
    };
  });

  const validBuckets = buckets.filter((b) => !b.hasRangeError);
  const totalDeployedMin = validBuckets.reduce((s, b) => s + b.bucketMin, 0);
  const totalDeployedMax = validBuckets.reduce((s, b) => s + b.bucketMax, 0);
  const isOverAllocated = totalDeployedMax > totalAmount;
  const cashBufferMin = Math.max(0, totalAmount - totalDeployedMax);
  const cashBufferMax = Math.max(0, totalAmount - totalDeployedMin);

  return {
    buckets,
    totalAmount,
    totalDeployedMin,
    totalDeployedMax,
    cashBufferMin,
    cashBufferMax,
    isOverAllocated,
    isFullyDeployed: cashBufferMin === 0 && cashBufferMax === 0 && !isOverAllocated,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lib/allocation-calculator.test.ts
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npm test
```

Expected: all pre-existing tests still pass, new tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/allocation-calculator.ts src/__tests__/lib/allocation-calculator.test.ts
git commit -m "feat(calc): add allocation calculator utility with unit tests"
```

---

## Task 3: AllocationCalculator React component

**Files:**
- Create: `src/components/marketing/allocation-calculator.tsx`

**Interfaces:**
- Consumes:
  - `calculate`, `Star`, `StarInput`, `CalculatorResult`, `BucketResult` from `@/lib/utils/allocation-calculator`
  - `fmtAmountShort` from `@/lib/utils/calculations`
  - `createClient` from `@/lib/supabase/client`
  - `Input` from `@/components/ui/input`
  - `Button` from `@/components/ui/button`
  - `GoogleCta` from `@/components/marketing/google-cta`
- Produces: `export function AllocationCalculator()` — used by the page in Task 4.

- [ ] **Step 1: Create the component file**

Create `src/components/marketing/allocation-calculator.tsx` with the full implementation:

```tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { GoogleCta } from "@/components/marketing/google-cta";
import { fmtAmountShort } from "@/lib/utils/calculations";
import {
  calculate,
  type Star,
  type StarInput,
  type BucketResult,
  type CalculatorResult,
} from "@/lib/utils/allocation-calculator";

const STARS = [4, 3, 2, 1] as const;

const STAR_LABELS: Record<Star, string> = {
  4: "★★★★",
  3: "★★★",
  2: "★★",
  1: "★",
};

type RangeState = { min: string; max: string };

const DEFAULT_RANGES: Record<Star, RangeState> = {
  4: { min: "6", max: "8" },
  3: { min: "4", max: "6" },
  2: { min: "2", max: "4" },
  1: { min: "0", max: "2" },
};

function parsePct(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function fmt(val: number): string {
  return fmtAmountShort(val);
}

function fmtRange(min: number, max: number, isAbsolute: boolean): string {
  if (isAbsolute) return fmt(min);
  return `${fmt(min)} – ${fmt(max)}`;
}

function fmtPctRange(min: number, max: number, total: number): string {
  const lo = Math.round((min / total) * 100);
  const hi = Math.round((max / total) * 100);
  if (lo === hi) return `${lo}%`;
  return `${lo}% – ${hi}%`;
}

export function AllocationCalculator() {
  const [amount, setAmount] = useState("");
  const [counts, setCounts] = useState<Record<Star, string>>({ 4: "", 3: "", 2: "", 1: "" });
  const [ranges, setRanges] = useState<Record<Star, RangeState>>(DEFAULT_RANGES);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => setIsLoggedIn(!!data.session));
  }, []);

  const totalAmount = parseFloat(amount) || 0;
  const canCalculate = totalAmount > 0;

  function invalidateResult() {
    setResult(null);
  }

  function handleCalculate() {
    if (!canCalculate) return;
    const inputs: StarInput[] = STARS.map((star) => ({
      star,
      count: parseInt(counts[star] || "0", 10) || 0,
      range: {
        min: parsePct(ranges[star].min),
        max: parsePct(ranges[star].max),
      },
    }));
    setResult(calculate(totalAmount, inputs));
  }

  const invalidRanges = new Set<Star>(
    STARS.filter((s) => parsePct(ranges[s].min) > parsePct(ranges[s].max))
  );

  return (
    <div className="space-y-6">
      {/* ── Calculator card ── */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
        {/* Total amount */}
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="total-amount"
          >
            Total investment amount
          </label>
          <Input
            id="total-amount"
            type="number"
            min={0}
            step={100000}
            placeholder="e.g. 5000000"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              invalidateResult();
            }}
            className="text-base max-w-xs"
          />
        </div>

        {/* Stock counts */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">
            How many stocks per rating?
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STARS.map((star) => (
              <div key={star} className="space-y-1.5">
                <label
                  htmlFor={`count-${star}`}
                  className="block text-xs font-medium text-chart-4"
                  aria-label={`${star} star stock count`}
                >
                  {STAR_LABELS[star]}
                </label>
                <Input
                  id={`count-${star}`}
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                  value={counts[star]}
                  onChange={(e) => {
                    setCounts((p) => ({ ...p, [star]: e.target.value }));
                    invalidateResult();
                  }}
                  className="text-center"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Advanced: allocation ranges */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={advancedOpen}
          >
            <span aria-hidden>{advancedOpen ? "▾" : "▸"}</span>
            Adjust allocation ranges
          </button>

          {advancedOpen && (
            <div className="space-y-3 pt-1 pl-4 border-l border-border">
              {STARS.map((star) => {
                const invalid = invalidRanges.has(star);
                return (
                  <div key={star} className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="w-12 shrink-0 text-xs text-chart-4"
                        aria-label={`${star} star`}
                      >
                        {STAR_LABELS[star]}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        aria-label={`${star} star minimum allocation percent`}
                        value={ranges[star].min}
                        onChange={(e) => {
                          setRanges((p) => ({
                            ...p,
                            [star]: { ...p[star], min: e.target.value },
                          }));
                          invalidateResult();
                        }}
                        className={`w-20 h-8 text-sm text-center ${invalid ? "border-destructive" : ""}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <span className="text-muted-foreground" aria-hidden>
                        —
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        aria-label={`${star} star maximum allocation percent`}
                        value={ranges[star].max}
                        onChange={(e) => {
                          setRanges((p) => ({
                            ...p,
                            [star]: { ...p[star], max: e.target.value },
                          }));
                          invalidateResult();
                        }}
                        className={`w-20 h-8 text-sm text-center ${invalid ? "border-destructive" : ""}`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    {invalid && (
                      <p className="text-xs text-destructive pl-14">
                        Min must be ≤ max
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground pt-2">
                To target a fixed percentage (not a range), set both min and
                max to the same value — e.g. min 8% max 8%.
              </p>
            </div>
          )}
        </div>

        <Button
          onClick={handleCalculate}
          disabled={!canCalculate}
          className="w-full sm:w-auto"
        >
          Calculate allocation
        </Button>
      </div>

      {/* ── Results ── */}
      {result && <Results result={result} isLoggedIn={isLoggedIn} />}
    </div>
  );
}

function Results({
  result,
  isLoggedIn,
}: {
  result: CalculatorResult;
  isLoggedIn: boolean | null;
}) {
  const STAR_LABELS: Record<Star, string> = {
    4: "★★★★",
    3: "★★★",
    2: "★★",
    1: "★",
  };

  const deployedIsAbsolute =
    result.totalDeployedMin === result.totalDeployedMax;
  const bufferIsAbsolute = result.cashBufferMin === result.cashBufferMax;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
      <h2 className="text-base font-semibold text-foreground">Results</h2>

      {result.isOverAllocated && (
        <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 px-4 py-2.5 text-sm text-chart-4">
          Targets exceed your total — reduce stock counts or percentages.
        </div>
      )}

      {result.buckets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Enter at least one stock count above to see allocations.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                <th className="pb-2 pr-4 font-medium">Rating</th>
                <th className="pb-2 pr-4 font-medium text-right">Stocks</th>
                <th className="pb-2 pr-4 font-medium text-right">Per stock</th>
                <th className="pb-2 font-medium text-right">Bucket total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {result.buckets.map((b: BucketResult) => (
                <tr key={b.star}>
                  <td className="py-2.5 pr-4 text-xs text-chart-4 tracking-tight">
                    {STAR_LABELS[b.star]}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                    {b.count}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-foreground">
                    {b.hasRangeError
                      ? "—"
                      : fmtRange(b.perStockMin, b.perStockMax, b.isAbsolute)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-foreground">
                    {b.hasRangeError
                      ? "—"
                      : fmtRange(b.bucketMin, b.bucketMax, b.isAbsolute)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border">
                <td
                  colSpan={2}
                  className="pt-3 text-xs text-muted-foreground"
                >
                  Targeting{" "}
                  <span className="font-medium text-foreground">
                    {fmtRange(
                      result.totalDeployedMin,
                      result.totalDeployedMax,
                      deployedIsAbsolute
                    )}
                  </span>{" "}
                  of {fmt(result.totalAmount)} total (
                  {fmtPctRange(
                    result.totalDeployedMin,
                    result.totalDeployedMax,
                    result.totalAmount
                  )}
                  )
                </td>
                <td
                  colSpan={2}
                  className={`pt-3 text-right text-xs font-medium ${
                    result.isFullyDeployed
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {result.isFullyDeployed ? (
                    "Fully deployed — no cash buffer"
                  ) : (
                    <>
                      Cash buffer:{" "}
                      <span className="text-foreground">
                        {fmtRange(
                          result.cashBufferMin,
                          result.cashBufferMax,
                          bufferIsAbsolute
                        )}
                      </span>{" "}
                      (
                      {fmtPctRange(
                        result.cashBufferMin,
                        result.cashBufferMax,
                        result.totalAmount
                      )}
                      )
                    </>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isLoggedIn === false && <MarketingPitch />}
    </div>
  );
}

function MarketingPitch() {
  return (
    <div className="mt-2 rounded-xl border border-primary/20 bg-primary/[0.03] p-6 space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Your portfolio, live
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground">
          This is the plan. StockTracker shows you how you&apos;re tracking
          against it — live.
        </h2>
      </div>

      <div className="space-y-4">
        {[
          {
            title: "Import from Zerodha in seconds",
            body: "Upload your holdings statement — your actual positions appear instantly, no manual entry.",
          },
          {
            title: "See exactly where you're off-target",
            body: "Every bucket shows current weight vs. your conviction range. Under or over, flagged by name.",
          },
          {
            title: "Know the exact amount to add or trim",
            body: "Not “rebalance” — the precise number for each stock to bring it into range.",
          },
        ].map((point) => (
          <div key={point.title} className="flex gap-3">
            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {point.title}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {point.body}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <GoogleCta className="w-full rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto">
          Continue with Google — it&apos;s free
        </GoogleCta>
        <p className="text-xs text-muted-foreground">
          No credit card. No spreadsheet. Your first portfolio is free.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors related to `allocation-calculator.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketing/allocation-calculator.tsx
git commit -m "feat(calc): add AllocationCalculator client component"
```

---

## Task 4: Calculator page (SSG + metadata + SEO)

**Files:**
- Create: `src/app/(marketing)/allocation-calculator/page.tsx`

**Interfaces:**
- Consumes: `AllocationCalculator` from `@/components/marketing/allocation-calculator`
- Produces: the `/allocation-calculator` route, statically rendered with full metadata.

- [ ] **Step 1: Create the page file**

Create `src/app/(marketing)/allocation-calculator/page.tsx`:

```tsx
import type { Metadata } from "next";
import {
  canonical,
  breadcrumbJsonLd,
  faqJsonLd,
  softwareApplicationJsonLd,
  organizationJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/marketing/json-ld";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FaqSection } from "@/components/marketing/faq";
import { AllocationCalculator } from "@/components/marketing/allocation-calculator";

const PATH = "/allocation-calculator";
const TITLE = "Stock Allocation Calculator — Size Positions by Conviction";
const DESCRIPTION =
  "Free stock allocation calculator for Indian investors. Enter your total amount, number of stocks per conviction tier, and target weight bands — get exact allocations per bucket instantly. No sign-up needed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "stock allocation calculator",
    "stock allocation calculator india",
    "portfolio allocation calculator",
    "position sizing calculator",
    "position sizing calculator india",
    "how much to invest in each stock",
    "conviction based position sizing",
    "portfolio sizing tool",
    "star rating allocation",
    "how to allocate stocks india",
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS = [
  {
    q: "How does the stock allocation calculator work?",
    a: "Enter your total investment amount, the number of stocks in each conviction tier (1–4 stars), and optional target weight bands per tier. The calculator shows how much to allocate to each bucket in total and what remains as a cash buffer.",
  },
  {
    q: "What percentage of portfolio should I put in each stock?",
    a: "A common conviction-based approach: 6–8% per 4-star holding, 4–6% per 3-star, 2–4% per 2-star, and 0–2% per 1-star. These are the defaults in this calculator — you can adjust them to match your own style.",
  },
  {
    q: "What is conviction-based position sizing?",
    a: "Instead of equal-weighting every stock, you size positions according to how strongly you believe in each one. Higher-conviction names get a larger target weight; speculative positions stay small. The star-rating system is one way to express that conviction as a number.",
  },
  {
    q: "What is the cash buffer in the results?",
    a: "The cash buffer is the portion of your total investment not assigned to any star bucket. It represents uninvested capital — useful as dry powder for future opportunities or to stay under your total.",
  },
];

function jsonLd(): string[] {
  return [
    breadcrumbJsonLd("Stock Allocation Calculator", PATH),
    faqJsonLd(FAQS),
    softwareApplicationJsonLd(),
    organizationJsonLd(),
  ];
}

export default function AllocationCalculatorPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <JsonLd graphs={jsonLd()} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary)/8%,transparent)]"
          />
          <div className="mx-auto max-w-2xl px-4 py-16 sm:py-20 text-center">
            <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground dark:bg-primary/10 dark:text-primary">
              Free tool
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              Stock allocation calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              See how much to put in each conviction bucket before you invest a
              single rupee.
            </p>
            <p className="mx-auto mt-4 max-w-prose text-sm text-muted-foreground">
              This calculator turns your conviction-based star ratings into
              concrete targets. Set how many 4-star, 3-star, 2-star, and 1-star
              stocks you hold, adjust the target weight band for each tier, and
              see exactly how much to deploy per bucket — along with how much
              stays as a cash buffer.
            </p>
          </div>
        </section>

        {/* Calculator */}
        <section className="border-t">
          <div className="mx-auto max-w-2xl px-4 py-12">
            <AllocationCalculator />
          </div>
        </section>

        {/* FAQ */}
        <FaqSection faqs={FAQS} />
      </main>

      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 2: Verify the build succeeds**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes with no errors. The output should include a line showing `/allocation-calculator` as a static route.

- [ ] **Step 3: Start dev server and manually verify the page**

```bash
npm run dev
```

Open `http://localhost:3000/allocation-calculator` and confirm:
- "Calculator" link appears in the header (on desktop viewport)
- Hero h1 reads "Stock allocation calculator"
- Form shows Total amount input + 4 star count inputs
- "Adjust allocation ranges" toggle opens/closes the advanced section
- "Calculate allocation" button is disabled with empty amount
- Entering amount + counts and clicking Calculate shows results table
- Results reset when any input changes
- Opening `http://localhost:3000` and checking that the "Calculator" header link is visible

- [ ] **Step 4: Verify the marketing pitch renders for non-auth users**

With dev server running, open the page in an incognito window (no Supabase session). Enter any amount + counts, click Calculate. The marketing pitch card should appear below results with the Google CTA.

- [ ] **Step 5: Run full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/(marketing)/allocation-calculator/page.tsx
git commit -m "feat(calc): add allocation calculator page with metadata, JSON-LD, FAQs"
```
