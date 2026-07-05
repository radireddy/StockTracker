# Holdings-only Progressive Disclosure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a holdings-only portfolio (no conviction/valuation research entered), hide research columns, the Star/Type filters, and the Allocation view, and replace the broken "Allocation health" card with a buttonless guidance card — automatically revealing all of it the moment any research field is saved on any company.

**Architecture:** A pure detector `hasResearchData(companies)` (in `src/lib/utils/`) is computed once by the dashboard page against the full portfolio and passed down as a boolean prop. Desktop (`CompaniesTable`) and mobile (`MobileDashboard` + `CompanyCard`) gate their research UI on that prop. A new `ResearchGuidanceCard` replaces `AllocationSummaryBar` when the flag is false. No data-model/API changes.

**Tech Stack:** Next.js 15 (App Router) + React 19 + TypeScript, Tailwind v4, Vitest (jsdom). base-ui `Select`. No React Testing Library present.

## Global Constraints

- **No new dependencies.** RTL is not installed; do not add it. Component tasks are verified with `npx tsc --noEmit`, `npm run lint`, `npm run build`, and manual app check — not automated render tests.
- **Watchlist behavior is unchanged.** The flag is applied only for `portfolioType === "holdings"`. Watchlist (`portfolioType === "watchlist"`) always shows its research columns/filters.
- **Detection runs on the full portfolio** — `data.companies` (raw), not the account-filtered `companies` list — so switching the account filter never changes research presence.
- **All-or-nothing reveal.** Any single research field on any company flips the whole research UI on. No per-column reveal.
- **Copy is source-neutral.** Never say "imported" — holdings may be added manually. Use "You're tracking N companies…".
- **The guidance card has no buttons/CTAs.** It is purely informational; the action is the user clicking a company row (existing behavior).
- The `@` import alias maps to `src/` (see `vitest.config.ts`).
- Coverage `include` is `src/lib/**` and `src/types/**` only (95% thresholds) — the detector lives in `src/lib/utils/` so it is covered.

---

### Task 1: `hasResearchData` detector (pure function)

**Files:**
- Create: `src/lib/utils/research-data.ts`
- Test: `src/__tests__/lib/utils/research-data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ResearchCompany = { star_rating: number | null; strategy: string | null; buy_price: number | null; projection_models: { valuation_scenarios: { target_market_cap: number | null; irr: number | null; buy_price: number | null }[] }[] }`
  - `function hasResearchData(companies: ResearchCompany[]): boolean`

This structural input type is a subset of the hook's `DashboardCompany` (and of `DashboardCompanyRow`), so either can be passed without conversion.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/lib/utils/research-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasResearchData, type ResearchCompany } from "@/lib/utils/research-data";

function bare(overrides: Partial<ResearchCompany> = {}): ResearchCompany {
  return {
    star_rating: null,
    strategy: null,
    buy_price: null,
    projection_models: [],
    ...overrides,
  };
}

describe("hasResearchData", () => {
  it("is false for an empty portfolio", () => {
    expect(hasResearchData([])).toBe(false);
  });

  it("is false when no company has any research field", () => {
    expect(hasResearchData([bare(), bare()])).toBe(false);
  });

  it("is false when a valuation model exists but every scenario figure is null", () => {
    const c = bare({
      projection_models: [
        { valuation_scenarios: [{ target_market_cap: null, irr: null, buy_price: null }] },
      ],
    });
    expect(hasResearchData([c])).toBe(false);
  });

  it("is true when any company has a star rating", () => {
    expect(hasResearchData([bare(), bare({ star_rating: 3 })])).toBe(true);
  });

  it("is true when any company has a strategy", () => {
    expect(hasResearchData([bare({ strategy: "core" })])).toBe(true);
  });

  it("is true when any company has a target buy price", () => {
    expect(hasResearchData([bare({ buy_price: 100 })])).toBe(true);
  });

  it("is true when any valuation scenario has a target market cap", () => {
    const c = bare({
      projection_models: [
        { valuation_scenarios: [{ target_market_cap: 5000, irr: null, buy_price: null }] },
      ],
    });
    expect(hasResearchData([c])).toBe(true);
  });

  it("is true when any valuation scenario has an irr", () => {
    const c = bare({
      projection_models: [{ valuation_scenarios: [{ target_market_cap: null, irr: 15, buy_price: null }] }],
    });
    expect(hasResearchData([c])).toBe(true);
  });

  it("is true when any valuation scenario has a buy price", () => {
    const c = bare({
      projection_models: [{ valuation_scenarios: [{ target_market_cap: null, irr: null, buy_price: 90 }] }],
    });
    expect(hasResearchData([c])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- research-data`
Expected: FAIL — cannot resolve `@/lib/utils/research-data` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/utils/research-data.ts`:

```ts
/**
 * Research fields that indicate a user has moved beyond plain holdings
 * tracking into conviction / valuation analysis. Structural subset of the
 * dashboard's company row, so callers can pass their rows directly.
 */
export type ResearchCompany = {
  star_rating: number | null;
  strategy: string | null;
  buy_price: number | null;
  projection_models: {
    valuation_scenarios: {
      target_market_cap: number | null;
      irr: number | null;
      buy_price: number | null;
    }[];
  }[];
};

/**
 * True when ANY company in the portfolio carries ANY research data:
 * a conviction star, a strategy (core/satellite), a target buy price, or a
 * valuation scenario with a non-null figure. Drives progressive disclosure of
 * the dashboard's research columns, filters, and allocation views.
 */
export function hasResearchData(companies: ResearchCompany[]): boolean {
  return companies.some(
    (c) =>
      c.star_rating != null ||
      c.strategy != null ||
      c.buy_price != null ||
      c.projection_models.some((pm) =>
        pm.valuation_scenarios.some(
          (s) => s.target_market_cap != null || s.irr != null || s.buy_price != null
        )
      )
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- research-data`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/research-data.ts src/__tests__/lib/utils/research-data.test.ts
git commit -m "feat(dashboard): add hasResearchData detector for progressive disclosure"
```

---

### Task 2: `ResearchGuidanceCard` component

**Files:**
- Create: `src/components/dashboard/research-guidance-card.tsx`

**Interfaces:**
- Consumes: nothing (pure presentational).
- Produces: `function ResearchGuidanceCard({ companiesCount, accountsCount }: { companiesCount: number; accountsCount: number }): JSX.Element`

This card sits in the same grid slot as `AllocationSummaryBar` (right column of the desktop hero grid). No buttons — informational only.

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/research-guidance-card.tsx`:

```tsx
import { Star, Target, TrendingUp } from "lucide-react";

/** One "input → what it unlocks" row inside the guidance card. */
function GuideRow({
  icon,
  title,
  detail,
  unlocks,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  unlocks: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[0.82rem] font-semibold leading-tight">{title}</div>
        <div className="text-[0.72rem] text-muted-foreground">{detail}</div>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-primary">
        {unlocks}
      </span>
    </div>
  );
}

/**
 * Shown in the allocation slot when a holdings portfolio has no research data.
 * Purely informational: it explains what each research input unlocks and tells
 * the user to click a company to add it. No buttons — the action is opening a
 * company row (existing behavior).
 */
export function ResearchGuidanceCard({
  companiesCount,
  accountsCount,
}: {
  companiesCount: number;
  accountsCount: number;
}) {
  const companyLabel = companiesCount === 1 ? "company" : "companies";
  const accountLabel = accountsCount === 1 ? "account" : "accounts";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-6 shadow-soft">
      <div>
        <h3 className="text-sm font-semibold">📊 Unlock allocation &amp; valuation tracking</h3>
        <p className="mt-1 text-[0.8rem] text-muted-foreground">
          You&rsquo;re tracking {companiesCount} {companyLabel}
          {accountsCount > 0 ? ` across ${accountsCount} ${accountLabel}` : ""}. Click a company
          to add its rating and research data — each feature below turns on by itself.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <GuideRow
          icon={<Star size={15} aria-hidden="true" />}
          title="Rate conviction (1–4★)"
          detail="How strongly you back each company"
          unlocks="Allocation health"
        />
        <GuideRow
          icon={<Target size={15} aria-hidden="true" />}
          title="Set a target buy price"
          detail="Your ideal entry price"
          unlocks="MoS %"
        />
        <GuideRow
          icon={<TrendingUp size={15} aria-hidden="true" />}
          title="Add valuation scenarios"
          detail="Base / bare-case fair value & IRR"
          unlocks="Base / Bare"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/research-guidance-card.tsx
git commit -m "feat(dashboard): add buttonless research guidance card"
```

---

### Task 3: Wire the flag into the dashboard page (desktop hero + prop threading)

**Files:**
- Modify: `src/app/(authenticated)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `hasResearchData` (Task 1), `ResearchGuidanceCard` (Task 2).
- Produces: passes a `hasResearchData: boolean` prop to `CompaniesTable` (Task 4) and `MobileDashboard` (Task 5).

- [ ] **Step 1: Add imports**

In `src/app/(authenticated)/dashboard/page.tsx`, after the existing `AllocationSummaryBar` import (line 10), add:

```tsx
import { ResearchGuidanceCard } from "@/components/dashboard/research-guidance-card";
import { hasResearchData } from "@/lib/utils/research-data";
```

- [ ] **Step 2: Compute the flag (full portfolio, holdings only)**

In the same file, immediately after the `companies` `useMemo` block (ends line 32), add:

```tsx
  // Detect research data across the WHOLE portfolio (not the account-filtered
  // subset) so toggling the account filter never changes what's shown.
  const researchPresent = useMemo(
    () => isHoldings && hasResearchData(data?.companies ?? []),
    [isHoldings, data]
  );
```

- [ ] **Step 3: Swap the allocation card for the guidance card**

Replace the hero grid block (lines 98–103) with:

```tsx
      {/* Summary hero (holdings, desktop) */}
      {isHoldings && !isLoading && companies.length > 0 && (
        <div className="hidden gap-4 lg:grid lg:grid-cols-[1fr_1.15fr]">
          <PortfolioPnlBar companies={companies} accountsCount={accounts.length} />
          {researchPresent ? (
            <AllocationSummaryBar companies={companies} allocationRanges={allocationRanges} />
          ) : (
            <ResearchGuidanceCard companiesCount={companies.length} accountsCount={accounts.length} />
          )}
        </div>
      )}
```

- [ ] **Step 4: Pass the flag to both tables**

In the `<CompaniesTable ... />` element (lines 113–121), add the prop:

```tsx
              hasResearchData={researchPresent}
```

In the `<MobileDashboard ... />` element (lines 125–132), add the prop:

```tsx
              hasResearchData={researchPresent}
```

- [ ] **Step 5: Verify type-check fails on the new props (expected until Tasks 4 & 5)**

Run: `npx tsc --noEmit`
Expected: errors on `hasResearchData` prop not existing on `CompaniesTable`/`MobileDashboard`. This is expected — Tasks 4 and 5 add those props. Do NOT commit yet; proceed to Task 4.

---

### Task 4: Gate research columns, Star/Type filters, and Allocation view in `CompaniesTable`

**Files:**
- Modify: `src/components/dashboard/companies-table.tsx`

**Interfaces:**
- Consumes: `hasResearchData: boolean` prop from Task 3.
- Produces: nothing new.

Note: for holdings-only, `showResearch` is false; for watchlist it is always true (watchlist is inherently research). The allocation view/segmented toggle only exists for holdings, so gating it additionally on `hasResearchData` is safe.

- [ ] **Step 1: Add the prop**

In the `CompaniesTable` props type (the object type starting line 218) add:

```tsx
  hasResearchData = true,
```
to the destructured params (after `onAccountFilterChange,`), and in the type literal add:

```tsx
  hasResearchData?: boolean;
```
(after `onAccountFilterChange?: (value: string) => void;`).

- [ ] **Step 2: Derive `showResearch` and gate the allocation view**

After `const isHoldings = portfolioType === "holdings";` (line 227), add:

```tsx
  // Research UI (conviction/valuation columns, star & type filters, allocation
  // views) shows for watchlists always, and for holdings only once any research
  // data exists.
  const showResearch = !isHoldings || hasResearchData;
```

Then change the allocation-view derivation (line 423) from:

```tsx
  const showAllocationView = viewMode === "allocation" && isHoldings;
```
to:

```tsx
  const showAllocationView = viewMode === "allocation" && isHoldings && showResearch;
```

- [ ] **Step 3: Gate the Portfolio/Allocation segmented toggle**

Change the toggle guard (line 475) from `{isHoldings && (` to:

```tsx
        {isHoldings && showResearch && (
```
(Closes at line 488 `)}` — leave that as-is.)

- [ ] **Step 4: Gate the Star filter**

Wrap the Star-filter `<Select>` (lines 528–544) in a `showResearch` guard. Change the opening from:

```tsx
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
```
to:

```tsx
        {showResearch && (
        <Select value={starFilter} onValueChange={(v) => setStarFilter(v ?? "all")}>
```
and change its closing `</Select>` (line 544) to:

```tsx
        </Select>
        )}
```

- [ ] **Step 5: Gate the Type (strategy) filter**

Change the strategy-filter guard (line 545) from `{!showAllocationView && isHoldings && (` to:

```tsx
        {!showAllocationView && isHoldings && showResearch && (
```

- [ ] **Step 6: Gate the research columns in the portfolio table header**

In the portfolio `<thead>`, the Star (`th` line 632) and Type (`th` line 635) headers apply to both holdings and watchlist. Wrap both in `{showResearch && (` … `)}`. Replace lines 632–637 (the two `<th>` blocks) with:

```tsx
                  {showResearch && (
                    <>
                      <th scope="col" className={`${thCenter} ${colHidden("star")}`} onClick={() => toggleSort("star_rating")}>
                        Star<SortIcon field="star_rating" sortField={sortField} sortDir={sortDir} />
                      </th>
                      <th scope="col" className={`${thCenter} ${colHidden("type")}`} onClick={() => toggleSort("strategy")}>
                        Type<SortIcon field="strategy" sortField={sortField} sortDir={sortDir} />
                      </th>
                    </>
                  )}
```

Then, in the holdings branch (`isHoldings ?` … lines 638–673), wrap the four research headers — Target Buy (661), MoS% (664), Base (667), Bare (670) — in a `showResearch` guard. Replace those four `<th>` blocks (lines 661–672) with:

```tsx
                      {showResearch && (
                        <>
                          <th scope="col" className={`${thRight} border-l border-border`} onClick={() => toggleSort("buy_price")}>
                            Target Buy<SortIcon field="buy_price" sortField={sortField} sortDir={sortDir} />
                          </th>
                          <th scope="col" className={thRight} onClick={() => toggleSort("mos")}>
                            MoS%<SortIcon field="mos" sortField={sortField} sortDir={sortDir} />
                          </th>
                          <th scope="col" className={thRight} onClick={() => toggleSort("base_cagr")}>
                            Base<SortIcon field="base_cagr" sortField={sortField} sortDir={sortDir} />
                          </th>
                          <th scope="col" className={`${thRight} ${colHidden("bare")}`} onClick={() => toggleSort("bare_cagr")}>
                            Bare<SortIcon field="bare_cagr" sortField={sortField} sortDir={sortDir} />
                          </th>
                        </>
                      )}
```

(The watchlist branch, lines 674–695, is left unchanged — watchlist always has `showResearch === true`.)

- [ ] **Step 7: Gate the matching research cells in the portfolio table body**

In the row body, wrap the Star cell (line 758) and Type cell (line 761) in `{showResearch && (` … `)}`. Replace lines 758–763 with:

```tsx
                        {showResearch && (
                          <>
                            <td className={`px-2 py-2 text-center ${colHidden("star")}`}>
                              <Stars rating={company.star_rating} className="text-[0.78rem]" />
                            </td>
                            <td className={`px-2 py-2 text-center ${colHidden("type")}`}>
                              <TypeChip strategy={company.strategy} />
                            </td>
                          </>
                        )}
```

Then in the holdings body branch, wrap the four research cells — Target Buy (787), MoS (790), Base (793), Bare (796). Replace lines 787–798 with:

```tsx
                            {showResearch && (
                              <>
                                <td className={`border-l border-border px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${isDefaulted ? "italic" : ""}`} title={isDefaulted ? "Base case buy price (no manual override)" : undefined}>
                                  {fmtPriceShort(buyPrice)}
                                </td>
                                <td className={`px-2.5 py-2 text-right font-mono font-semibold tabular-nums ${mosClass(mos)}`}>
                                  {fmtPctShort(mos)}
                                </td>
                                <td className="px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
                                  {fmtIrr(baseReturn)}
                                </td>
                                <td className={`px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground ${colHidden("bare")}`}>
                                  {fmtIrr(bareReturn)}
                                </td>
                              </>
                            )}
```

- [ ] **Step 8: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass. (Task 3's props error on `CompaniesTable` is now resolved; `MobileDashboard` may still error until Task 5 — if building alone here, expect the `MobileDashboard` prop error and continue to Task 5 before the final build.)

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/companies-table.tsx
git commit -m "feat(dashboard): gate research columns, star/type filters, allocation view on hasResearchData"
```

---

### Task 5: Gate research UI in the mobile view (`MobileDashboard` + `CompanyCard`)

**Files:**
- Modify: `src/components/dashboard/mobile-dashboard.tsx`
- Modify: `src/components/dashboard/company-card.tsx`

**Interfaces:**
- Consumes: `hasResearchData: boolean` prop from Task 3.
- Produces: passes `hasResearchData` to `CompanyCard`.

- [ ] **Step 1: Add imports to MobileDashboard**

In `src/components/dashboard/mobile-dashboard.tsx`, add to the lucide import (line 6) the `BarChart3` icon, i.e. change:

```tsx
import { Search, SlidersHorizontal, Upload, Plus, Eye } from "lucide-react";
```
to:

```tsx
import { Search, SlidersHorizontal, Upload, Plus, Eye, BarChart3 } from "lucide-react";
```

- [ ] **Step 2: Add the prop to MobileDashboard**

In the destructured params (starting line 147) add `hasResearchData = true,` after `onAccountFilterChange,`. In the props type literal (starting line 153) add:

```tsx
  hasResearchData?: boolean;
```
after `onAccountFilterChange?: (value: string) => void;`.

- [ ] **Step 3: Add a compact guidance card for holdings-only mobile**

Add this component above `MobileDashboard` (e.g. after the `PortfolioSummary` function, before line 146):

```tsx
function MobileResearchGuidance() {
  return (
    <div className="rounded-[18px] border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2 text-[0.85rem] font-semibold">
        <BarChart3 size={15} aria-hidden="true" className="text-primary" />
        Unlock allocation &amp; valuation
      </div>
      <p className="mt-1 text-[0.75rem] text-muted-foreground">
        Tap a company to add a conviction rating, target buy price, or valuation.
        Allocation health, MoS % and fair-value targets turn on automatically.
      </p>
    </div>
  );
}
```

Then render it in the list, right after the `PortfolioSummary` line (line 243). Change:

```tsx
      {isHoldings && !isEmpty && <PortfolioSummary companies={companies} />}
```
to:

```tsx
      {isHoldings && !isEmpty && <PortfolioSummary companies={companies} />}
      {isHoldings && !isEmpty && !hasResearchData && <MobileResearchGuidance />}
```

- [ ] **Step 4: Hide the Allocation filter section when there's no research data**

The Allocation `SheetSection` (lines 358–365) is inside `{isHoldings ? (...) : (...)}`. Change the condition from `{isHoldings ? (` (line 358) to `{isHoldings && hasResearchData ? (`. This makes holdings-only fall through to the watchlist branch (Buy-signals) — which is wrong for holdings. Instead, replace the whole ternary (lines 358–372) with explicit branches:

```tsx
          {isHoldings ? (
            hasResearchData ? (
              <SheetSection title="Allocation">
                {ALLOC_OPTS.map((o) => (
                  <Chip key={o.value} active={allocFilter === o.value} dot={o.dot} onClick={() => setAllocFilter(o.value)}>
                    {o.label}
                  </Chip>
                ))}
              </SheetSection>
            ) : null
          ) : (
            <SheetSection title="Filter">
              <Chip active={buyOnly} onClick={() => setBuyOnly((v) => !v)}>
                Buy signals only
              </Chip>
            </SheetSection>
          )}
```

- [ ] **Step 5: Pass the flag to CompanyCard**

In the `rows.map(...)` render (lines 306–314), add the prop to `<CompanyCard>`:

```tsx
            <CompanyCard
              key={company.id}
              company={company}
              metrics={metrics}
              portfolioType={portfolioType}
              hasResearchData={hasResearchData}
              onOpen={(id) => router.push(`/company/${id}`)}
            />
```

- [ ] **Step 6: Add the prop to CompanyCard and gate its research UI**

In `src/components/dashboard/company-card.tsx`, add the prop. Change the destructured params (lines 94–104) to include `hasResearchData = true,` and the type to include `hasResearchData?: boolean;`:

```tsx
export function CompanyCard({
  company,
  metrics,
  portfolioType,
  hasResearchData = true,
  onOpen,
}: {
  company: DashboardCompanyRow;
  metrics: HoldingMetrics;
  portfolioType: "holdings" | "watchlist";
  hasResearchData?: boolean;
  onOpen: (id: string) => void;
}) {
```

Then add a local flag after `const buy = isBuySignal(...)` (line 107):

```tsx
  const showResearch = !isHoldings || hasResearchData;
```

Gate the allocation status stripe (lines 115–121): change `{isHoldings && (` to `{isHoldings && showResearch && (`.

Gate the star/strategy inline meta (lines 129–134): wrap the `<Stars>` and strategy `<span>` in `{showResearch && (` … `)}`. Replace lines 129–134 with:

```tsx
            {showResearch && (
              <>
                <Stars rating={company.star_rating} className="text-[0.72rem]" />
                {company.strategy && (
                  <span className="rounded bg-muted px-1.5 py-px text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground">
                    {company.strategy}
                  </span>
                )}
              </>
            )}
```

Gate the research/allocation footer block (lines 183–186): change:

```tsx
      <div className="mt-3 border-t border-border/70 pt-2.5">
        <ResearchStrip metrics={metrics} />
        {isHoldings && <AllocationBar metrics={metrics} />}
      </div>
```
to:

```tsx
      {showResearch && (
        <div className="mt-3 border-t border-border/70 pt-2.5">
          <ResearchStrip metrics={metrics} />
          {isHoldings && <AllocationBar metrics={metrics} />}
        </div>
      )}
```

- [ ] **Step 7: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm run test && npm run build`
Expected: all pass (typecheck clean now that both `CompaniesTable` and `MobileDashboard` accept the prop; unit tests green; build succeeds).

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/mobile-dashboard.tsx src/components/dashboard/company-card.tsx src/app/\(authenticated\)/dashboard/page.tsx
git commit -m "feat(dashboard): gate mobile research UI + wire guidance card into dashboard page"
```

---

### Task 6: "Un-rated companies" nudge in `AllocationSummaryBar`

**Files:**
- Modify: `src/components/dashboard/allocation-summary-bar.tsx`

**Interfaces:**
- Consumes: existing `companies` prop.
- Produces: nothing new.

Once research is active, some held companies may still be un-rated (they fall
into the implicit 1★ bucket). Surface a small line prompting the user to rate
them, matching the approved mockup.

- [ ] **Step 1: Compute the un-rated count**

In `src/components/dashboard/allocation-summary-bar.tsx`, after `if (!starGroups) return null;` (line 59), add:

```tsx
  const unratedCount = companies.filter(
    (c) => c.star_rating == null && c.quantity != null && c.quantity > 0
  ).length;
```

- [ ] **Step 2: Render the nudge under the bars**

Immediately before the closing `</div>` of the card (after the `starGroups.map(...)` block ends, line 105), add:

```tsx
      {unratedCount > 0 && (
        <p className="text-[0.72rem] text-muted-foreground">
          {unratedCount} {unratedCount === 1 ? "company is" : "companies are"} not yet rated — rate them to include in allocation.
        </p>
      )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/allocation-summary-bar.tsx
git commit -m "feat(dashboard): nudge to rate un-rated companies in allocation card"
```

---

### Task 7: Manual verification in the app

**Files:** none (verification only).

- [ ] **Step 1: Run the dev server**

Run: `npm run dev` and open the dashboard for a holdings portfolio that has NO research data (fresh import / manual holdings only).

- [ ] **Step 2: Verify holdings-only state (desktop)**

Confirm:
- The right hero card shows the **guidance card** (📊 Unlock allocation & valuation tracking), not the "1★ · 100% · OVER" bar.
- The table shows only Company, Qty, Avg Buy, CMP, Cost, Cur. Value, P&L %, P&L ₹ — **no** Star, Type, Target Buy, MoS%, Base, Bare columns.
- The **Portfolio/Allocation** toggle, **Star** filter, and **Type** filter are **absent**.

- [ ] **Step 3: Verify reveal**

Open one company, set a conviction star (or target buy), save, return to the dashboard. Confirm all research columns, both filters, the Allocation tab, and the real Allocation health card now appear; un-rated companies show `–`.

- [ ] **Step 4: Verify mobile (narrow viewport)**

At mobile width, confirm the holdings-only portfolio shows the compact guidance card, cards omit the research strip / allocation bar / status stripe, and the filter sheet has no "Allocation" section — and that all of it returns once a star is set.

- [ ] **Step 5: Verify watchlist unaffected**

Switch to a watchlist portfolio and confirm its research columns/filters render exactly as before (the flag does not apply to watchlists).
