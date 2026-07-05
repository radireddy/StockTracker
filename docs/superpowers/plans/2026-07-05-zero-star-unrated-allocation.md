# Zero-star (un-rated) Allocation Bucket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give un-rated companies (`star_rating == null`) their own 0★ allocation bucket with a fixed 0% target so any un-rated holdings read as over-allocated, instead of hiding inside the 1★ bucket.

**Architecture:** Introduce a fixed `"0": {min:0,max:0}` range in the allocation-range helpers, then switch the implicit `?? 1` fallback to `?? 0` in the two allocation views (allocation-summary-bar, companies-table). Per-row allocation status flows through the same helpers, so it updates automatically. 0★ is display-only — `star_rating` stays `1..4 | null` and the settings editor stays 4★–1★.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Vitest (jsdom).

## Global Constraints

- `star_rating` stored type is unchanged: `number | null` (values `1..4` or `null`). Do **not** persist a literal `0`. 0★ is purely the display bucket for `null`.
- 0★ target is **fixed** at `{min:0, max:0}` and is NOT user-editable. The settings allocation editor (`src/components/settings/allocation-ranges-editor.tsx`) must remain `stars = [4,3,2,1]`.
- The `Stars` component (`src/components/ui/stars.tsx`) renders `null` for `rating <= 0` — any 0★ row must use an explicit "Not rated" text label, never `<Stars rating={0} />`.
- Verification per task: `npm run lint && npm run typecheck && npm test`.
- Commit messages end with the Co-Authored-By trailer used on this branch.

---

### Task 1: Fixed 0★ range in allocation helpers

**Files:**
- Modify: `src/types/database.ts` (the `DEFAULT_ALLOCATION_RANGES` constant, ~lines 6-11)
- Modify: `src/lib/utils/calculations.ts` (`getEffectiveRanges` ~line 254, `getRangeForStar` ~line 259)
- Test: `src/__tests__/lib/calculations.test.ts` (existing `getRangeForStar` / `getEffectiveRanges` describes, ~lines 675-694)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `DEFAULT_ALLOCATION_RANGES` gains key `"0": { min: 0, max: 0 }`.
  - `getEffectiveRanges(userRanges: AllocationRanges | null): AllocationRanges` — return value always contains `"0": {min:0,max:0}`, even when `userRanges` is a saved custom object without a `"0"` key.
  - `getRangeForStar(null, ranges)` returns `{min:0, max:0}`; `getRangeForStar(99, ranges)` still returns `{min:0, max:2}`.

- [ ] **Step 1: Update the failing test for `getRangeForStar` null case**

In `src/__tests__/lib/calculations.test.ts`, replace the existing null-case test (currently expecting `{min:0,max:2}`) with the 0★ expectation, and add a `getEffectiveRanges` custom-ranges test:

```typescript
  it("defaults to the fixed 0-star range when null", () => {
    expect(getRangeForStar(null, DEFAULT_ALLOCATION_RANGES)).toEqual({ min: 0, max: 0 });
  });

  it("returns default range for unknown star", () => {
    expect(getRangeForStar(99, DEFAULT_ALLOCATION_RANGES)).toEqual({ min: 0, max: 2 });
  });
```

Then, inside the `describe("getEffectiveRanges", ...)` block (near line 677), add:

```typescript
  it("always injects a fixed 0-star range, even over custom ranges", () => {
    const custom = { "1": { min: 0, max: 5 }, "4": { min: 5, max: 10 } };
    expect(getEffectiveRanges(custom)["0"]).toEqual({ min: 0, max: 0 });
    expect(getEffectiveRanges(null)["0"]).toEqual({ min: 0, max: 0 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- calculations`
Expected: FAIL — `getRangeForStar(null, ...)` returns `{min:0,max:2}` (not `{0,0}`); `getEffectiveRanges(custom)["0"]` is `undefined`.

- [ ] **Step 3: Add the 0★ default range**

In `src/types/database.ts`, add the `"0"` entry to `DEFAULT_ALLOCATION_RANGES`:

```typescript
export const DEFAULT_ALLOCATION_RANGES: AllocationRanges = {
  "0": { min: 0, max: 0 },
  "1": { min: 0, max: 2 },
  "2": { min: 2, max: 4 },
  "3": { min: 4, max: 6 },
  "4": { min: 6, max: 8 },
};
```

- [ ] **Step 4: Force the 0★ range in the helpers**

In `src/lib/utils/calculations.ts`, update `getEffectiveRanges` to always inject the fixed 0★ entry, and `getRangeForStar` to map `null` → `"0"`:

```typescript
/** Get the effective allocation ranges (user overrides or defaults). 0★ is always fixed at 0%. */
export function getEffectiveRanges(userRanges: AllocationRanges | null): AllocationRanges {
  return { ...(userRanges ?? DEFAULT_ALLOCATION_RANGES), "0": { min: 0, max: 0 } };
}

/** Get allocation range for a star rating. null (un-rated) resolves to the fixed 0★ range. */
export function getRangeForStar(star: number | null, ranges: AllocationRanges): AllocationRange {
  const key = String(star ?? 0);
  return ranges[key] ?? { min: 0, max: 2 };
}
```

Note: `getRangeForStar(null, DEFAULT_ALLOCATION_RANGES)` now finds `ranges["0"]` = `{0,0}`. The `?? {0,2}` fallback only fires for genuinely unknown keys (e.g. `99`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- calculations`
Expected: PASS. Also confirm the existing `getEffectiveRanges(null)` toEqual `DEFAULT_ALLOCATION_RANGES` test still passes (DEFAULT now contains `"0"`, so the spread equals it).

- [ ] **Step 6: Commit**

```bash
git add src/types/database.ts src/lib/utils/calculations.ts src/__tests__/lib/calculations.test.ts
git commit -m "feat(allocation): fixed 0-star range for un-rated companies

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 0★ bar + nudge in the Allocation health card

**Files:**
- Modify: `src/components/dashboard/allocation-summary-bar.tsx`

**Interfaces:**
- Consumes: `getEffectiveRanges` / `getAllocationStatus` from Task 1 (0★ now resolves to `{0,0}`).
- Produces: no exported API change — internal rendering only.

- [ ] **Step 1: Include 0★ in group aggregation**

In `src/components/dashboard/allocation-summary-bar.tsx`, update the `useMemo` block (~lines 30-57). Change the `groupValues` seed, the fallback star, the group range, the iteration order, and the count filter:

```typescript
  const starGroups = useMemo(() => {
    let totalValue = 0;
    const groupValues: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };

    for (const c of companies) {
      const qty = c.quantity;
      const price = c.indian_stocks?.price;
      if (!qty || !price) continue;
      const value = qty * price;
      totalValue += value;
      const star = c.star_rating ?? 0;
      if (star >= 0 && star <= 4) groupValues[star] += value;
    }

    if (totalValue === 0) return null;

    return [4, 3, 2, 1, 0].map((star) => {
      const pct = (groupValues[star] / totalValue) * 100;
      const range = ranges[String(star)] ?? { min: 0, max: 2 };
      const count = companies.filter(
        (c) => (c.star_rating ?? 0) === star && c.quantity && c.quantity > 0
      ).length;
      const groupMin = range.min * count;
      const groupMax = range.max * count;
      const status = getAllocationStatus(pct, { min: groupMin, max: groupMax });
      return { star, pct, groupMin, groupMax, status, count };
    });
  }, [companies, ranges]);
```

- [ ] **Step 2: Render a "Not rated" label for the 0★ bar**

In the `starGroups.map(...)` render (~lines 74-109), the label is currently `<Stars rating={star} ... />`. Replace that single line with a conditional so 0★ shows text instead (since `Stars` renders nothing at 0). The label element occupies the same fixed-width slot:

```tsx
            {star === 0 ? (
              <span className="w-[62px] shrink-0 text-[0.72rem] text-muted-foreground">
                Not rated
              </span>
            ) : (
              <Stars rating={star} className="w-[62px] shrink-0 text-[0.76rem]" />
            )}
```

Also update the row's `aria-label` (~line 84) so 0★ reads sensibly. Change the leading `${star} star:` to derive from the bucket:

```tsx
            aria-label={`${star === 0 ? "Not rated" : `${star} star`}: ${pct.toFixed(1)}% of portfolio, target ${groupMin.toFixed(0)}–${groupMax.toFixed(0)}%, ${STATUS_LABEL[status]}`}
```

- [ ] **Step 3: Update the nudge copy**

Replace the nudge paragraph (~lines 110-114) so it matches the new behaviour (un-rated now count as over-allocated, not assumed 1★):

```tsx
      {unratedCount > 0 && (
        <p className="text-[0.72rem] text-muted-foreground">
          {unratedCount} {unratedCount === 1 ? "company isn’t" : "companies aren’t"} rated yet — un-rated holdings count as over-allocated until you rate them.
        </p>
      )}
```

(Uses the `’` escape for the apostrophe to satisfy the react/no-unescaped-entities lint rule this repo enforces — matching the existing `&rsquo;` intent.)

- [ ] **Step 4: Verify lint, types, and tests**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. No test asserts the old "assumed 1★" text (grep confirmed only `calculations.test.ts` touches this area), so nothing else should break.

- [ ] **Step 5: Manual check (dev server)**

Run: `npm run dev`, open the dashboard with 1 rated + 24 un-rated companies.
Expected: a "Not rated" bar near the bottom at ~92% tagged OVER (target band collapsed to a marker at the far left), the 4★ bar at ~8% against its own band, and the updated nudge line below.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/allocation-summary-bar.tsx
git commit -m "feat(dashboard): show un-rated holdings as a 0-star (over-allocated) bar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 0★ group in the companies allocation table

**Files:**
- Modify: `src/components/dashboard/companies-table.tsx` (grouping ~lines 1099-1108, group header render ~lines 1167-1175)

**Interfaces:**
- Consumes: `getRangeForStar` / `getAllocationStatus` from Task 1 (un-rated rows now resolve to `{0,0}` → per-row status "over" when they hold value — no code change needed there, it flows through automatically).
- Produces: no exported API change.

- [ ] **Step 1: Add the 0★ group to the grouping**

In `src/components/dashboard/companies-table.tsx`, update the group builder (~lines 1099-1108) to include `0` and bucket un-rated into it:

```typescript
  const groups = [4, 3, 2, 1, 0]
    .map((star) => {
      const members = filtered.filter((c) => {
        const s = c.star_rating ?? 0;
        const bucket = s >= 0 && s <= 4 ? s : 0;
        return bucket === star;
      });
      return { star, members };
    })
    .filter((g) => g.members.length > 0);
```

- [ ] **Step 2: Render "Not rated" in the 0★ group header**

In the `groups.map(...)` render (~line 1171), the header currently shows `<Stars rating={star} className="w-[70px] shrink-0 text-[0.85rem]" />`. Replace that line with a conditional (Task 1 ensures `range` for star 0 is `{0,0}`, so the existing "trim ₹X to reach 0%" action already works):

```tsx
                    {star === 0 ? (
                      <span className="w-[70px] shrink-0 text-[0.8rem] text-muted-foreground">
                        Not rated
                      </span>
                    ) : (
                      <Stars rating={star} className="w-[70px] shrink-0 text-[0.85rem]" />
                    )}
```

- [ ] **Step 3: Verify lint, types, and tests**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 4: Manual check**

Reload the dashboard allocation table view.
Expected: a "Not rated" group header for the un-rated companies with target "0–0%", tagged OVER, and a "trim ₹X to reach 0%" action; individual un-rated rows show the "over" allocation status chip.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/companies-table.tsx
git commit -m "feat(dashboard): group un-rated companies under a 0-star bucket in allocation table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** §1 database default → Task 1 Step 3. §2 helpers → Task 1 Steps 3-4. §3 allocation bar (bar + Not-rated label + nudge) → Task 2. §4 companies-table grouping + header → Task 3. §5 dashboard-metrics per-row status → covered automatically by Task 1 (no code change; verified in Task 3 Step 4). Tests → Task 1 Step 1. Non-goal "settings editor stays 4★–1★" → enforced by Global Constraints; no task modifies it.
- **Type consistency:** `getEffectiveRanges` / `getRangeForStar` signatures unchanged; `?? 0` used consistently for the null→0★ fallback in both views; "Not rated" label used in both 0★ render sites.
- **Placeholder scan:** none — every code step shows full code.
