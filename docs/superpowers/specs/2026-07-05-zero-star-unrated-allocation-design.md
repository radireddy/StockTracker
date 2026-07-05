# Zero-star (un-rated) allocation bucket

**Date:** 2026-07-05
**Branch:** `feat/holdings-only-progressive-disclosure`
**Status:** Approved design, pending implementation

## Problem

Un-rated companies (`star_rating == null`) are currently treated as an implicit
**1★** everywhere in the allocation UI. With 24 of 25 companies un-rated, they all
pile into the 1★ bucket, whose target band is 0–2% *per company*. The result is a
1★ bar showing 92% "OVER" — the number is technically consistent but misleading,
because those holdings have no conviction target at all; they simply haven't been
rated yet.

## Goal

Give un-rated companies their own **0★ bucket** with a fixed target of **0%**, so
any value sitting in un-rated holdings reads as over-allocated. This nudges the
user to actually rate their companies rather than hiding un-rated weight inside 1★.

Rules:
- Un-rated (`star_rating == null`) → 0★ bucket.
- 0★ target range is fixed at **{ min: 0, max: 0 }** — not user-editable.
- Any 0★ value > 0% ⇒ status "over".
- Applies **everywhere** the implicit-1★ assumption currently lives (allocation
  card, companies-table grouping, per-row allocation status, range helper).

## Non-goals

- The settings **Allocation ranges editor** stays `[4,3,2,1]` only — 0★ is not an
  editable row (its target is fixed at 0%).
- Persistence defaults elsewhere (`holdings-actions` `?? 2`, edit dialogs `?? 2`)
  are out of scope — this change is about *display/grouping*, not what gets saved.
- `star_rating` remains `1..4 | null`. We do **not** introduce a stored `0` value;
  0★ is purely the display bucket for `null`.

## Changes

### 1. `src/types/database.ts` — add the 0★ default range
Add `"0": { min: 0, max: 0 }` to `DEFAULT_ALLOCATION_RANGES` so direct consumers
of the constant see the bucket.

### 2. `src/lib/utils/calculations.ts` — force 0★ to 0%
- `getEffectiveRanges`: always inject a fixed 0★ entry so it survives a user's
  saved custom ranges (which won't contain a `"0"` key):
  ```ts
  return { ...(userRanges ?? DEFAULT_ALLOCATION_RANGES), "0": { min: 0, max: 0 } };
  ```
- `getRangeForStar`: map `null` → `"0"` (was `"1"`):
  ```ts
  const key = String(star ?? 0);
  ```
  With the injected `"0"` entry, an un-rated company resolves to `{min:0,max:0}`.

### 3. `src/components/dashboard/allocation-summary-bar.tsx` — 0★ bar + nudge
- Include `0` in `groupValues` (`{ 0:0, 1:0, 2:0, 3:0, 4:0 }`).
- `const star = c.star_rating ?? 0; if (star >= 0 && star <= 4) groupValues[star] += value;`
- Iterate `[4, 3, 2, 1, 0]` for the bars.
- Count filter uses `(c.star_rating ?? 0) === star`.
- Render label: `Stars` returns `null` for rating 0, so for the 0★ row render an
  explicit **"Not rated"** text label (same width slot as `Stars`) instead.
- **Nudge copy** (kept per decision): replace the "assumed 1★" line with something
  that matches the new behaviour, e.g.:
  > "{n} companies aren't rated yet — un-rated holdings count as over-allocated
  >  until you rate them."

Edge notes (already handled by existing code):
- With `groupMax = 0`, the target band collapses to a zero-width dashed marker at
  the left edge — visually reads as "target 0%". Fine.
- `getAllocationStatus(pct, {0,0})`: pct>0 → over; pct==0 → in_range. The 0★ bar
  only renders when `count > 0`; a 0-value edge (qty but no price) shows in_range,
  which is acceptable.

### 4. `src/components/dashboard/companies-table.tsx` — 0★ group
- Grouping (line ~1099): iterate `[4, 3, 2, 1, 0]`; `const s = c.star_rating ?? 0;
  const bucket = s >= 0 && s <= 4 ? s : 0;`.
- Group header (line ~1167): for `star === 0`, render **"Not rated"** instead of
  `Stars` (which renders nothing at 0). The per-group action ("trim ₹X to reach
  0%") already works with `groupMax = 0`.

### 5. `src/lib/utils/dashboard-metrics.ts` — per-row status
No code change needed: `getRangeForStar(company.star_rating, ranges)` now returns
`{0,0}` for un-rated rows, so their per-row allocation chip becomes "over" when
they hold value. This is the intended "everywhere" consequence.

## Tests

Update / add in `src/__tests__/lib/calculations.test.ts`:
- `getRangeForStar(null, ...)` now expects `{ min: 0, max: 0 }` (was `{0,2}`).
- `getEffectiveRanges(null)` and `getEffectiveRanges(customRanges)` both include a
  `"0": {min:0,max:0}` entry.
- Unknown star (e.g. 99) still falls back to `{min:0,max:2}`.

Update `src/__tests__` allocation-summary / consolidation tests if any assert the
"assumed 1★" nudge text or the 1★ grouping of un-rated companies.

Add a focused test: an un-rated company with holdings lands in the 0★ group and
reports allocation status "over".

## Verification

- `npm run lint && npm run typecheck && npm test`
- Manual: dashboard with 1 rated + 24 un-rated shows a 0★ "Not rated" bar at ~92%
  OVER, a 4★ bar at ~8% (its own target band), and the updated nudge line.
