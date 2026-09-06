# Corporate-Action Auto-Detection & Apply on Import — Design Spec

**Date:** 2026-09-05
**Status:** Approved design, pending implementation plan
**Depends on:** `2026-09-05-corporate-actions-security-identity-design.md` (the
`corporate_actions` table, `canonical_stock_id`, CA-aware FIFO, and
`open_position_snapshots` are already built and applied).

## Problem

Splits and bonuses change share quantity and per-share price. When a tradebook
spans such an action, raw buy/sell quantities don't reconcile — e.g. buy 100,
1:1 bonus → hold 200, sell 200: sells exceed buys and FIFO can't match them.
Today the fix is manual (a person seeds `corporate_actions`). We want the import
to **detect** likely corporate actions, **apply** the ones we can verify, and
**clearly explain** the rest so the user can confirm — the way mProfit does.

## Goals

- Detect securities in an import whose trades imply a missing split/bonus.
- Auto-apply actions that match authoritative reference data; show them as
  "auto-applied" with plain-English detail.
- For actions only *inferred* from a quantity mismatch, show the reasoning and
  require the user's confirmation before applying.
- Keep the live import path **network-free and reliable on Vercel**.
- Never silently apply a guess.

## Non-goals (deferred)

- Mergers / demergers / spin-offs / schemes of arrangement (multi-security basis
  allocation).
- **Rights & buybacks** — they change holdings but are *optional/user-specific*
  (you choose to subscribe/tender), so there is no mechanical ratio to apply;
  they belong to the inferred/manual path, not auto-apply.
- Non-equity bonuses (NCRPS / preference / warrants) — explicitly excluded so
  they are never mistaken for an equity factor.
- BSE-only historical backfill (BSE feed is forthcoming-only) — see Scope.
- Symbol-rename alias history — see Identity (future extension).
- Dividends (no effect on quantity — filtered out).
- Strict per-tax bonus treatment (zero-cost lot) — v1 models bonus as a
  quantity multiplier, consistent with the prior spec.
- Running the NSE scraper inside a serverless request (see Constraint).

## Key constraint (shapes the whole design)

The `nse-bse-api` library scrapes NSE, which **blocks datacenter/cloud IPs** and
requires browser-like session cookies. It ran fine from a local Indian IP but
will be unreliable/blocked from Vercel. Therefore:

- The library is used **offline only** — a local or cron sync that populates the
  `corporate_actions` reference table.
- The **import path never calls the network.** It reads the reference table and
  infers gaps purely from the user's own trade data.

## Decisions (confirmed)

1. **Data source:** offline **market-wide** sync → `corporate_action_ref` feed
   (all NSE/BSE actions, decoupled from `indian_stocks`); import reads that feed
   to verify, and infers gaps from the user's trades.
2. **Apply policy:** auto-apply **verified** actions (match the table); **infer**
   actions require user confirmation.
3. **Detection basis:** infer candidates from the user's trades, cross-check the
   reference table to verify.
4. **Sync cadence:** incremental (watermark-based), first run backfills.

---

## Component 1 — Offline sync (market-wide, watermark-based)

`scripts/sync-corporate-actions.ts` (run locally or by a cron on a non-blocked
IP; never on Vercel).

**Market-wide, not per-holding.** The sync fetches **every** corporate action in
a date window across the whole exchange — `nse.actions({ from_date, to_date })`
with **no symbol filter** (verified: ~427 events / 416 symbols / 8 splits+bonuses
in a 5-week window). This decouples reference coverage from what any user holds,
so the *first* user to trade a stock still gets auto-verify. It is also far
cheaper than iterating symbols — a handful of queries per run.

**Reference source strategy (extensible):**
```
interface CorporateActionSource {
  readonly name: string;                              // 'nse' | 'bse' | ...
  readonly supportsHistory: boolean;                  // NSE: true, BSE: false
  fetchWindow(from: Date, to: Date): Promise<RawCorporateAction[]>;  // market-wide
}
```
- **`nseSource` (primary)** — `new NSE(dir).actions({ from_date, to_date, segment })`.
  Honors the date range (**historical + incremental**) and returns **ISIN**.
- **`bseSource` (secondary)** — `new BSE().actions(...)`. **Forthcoming-only**
  (verified: it ignores a past date range and returns upcoming actions), and
  returns **scrip_code + short_name, no ISIN**. Used to capture BSE-only names
  going forward; it cannot backfill BSE history.
- A registry mirrors the broker-adapter pattern (EODHD etc. can be added later).

**Reference table (new) — decoupled from `indian_stocks`:**
```sql
CREATE TABLE corporate_action_ref (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,                          -- 'nse'
  symbol      TEXT NOT NULL,                          -- e.g. 'TDPOWERSYS'
  isin        TEXT,                                   -- current ISIN if given
  action_type TEXT NOT NULL CHECK (action_type IN ('split','bonus')),
  ex_date     DATE NOT NULL,
  factor      NUMERIC(20,8) NOT NULL CHECK (factor > 0),
  raw_subject TEXT,                                   -- original text, for audit
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (source, symbol, action_type, ex_date)       -- + indexes: see migration & §Performance
);
```
Keyed by **symbol/isin, not `stock_id`** — a market-wide feed that exists whether
or not any user (or the `indian_stocks` master) currently has that security. This
is the table that answers "a stock not in our master": the reference feed still
covers it, and it gets matched when someone eventually trades it. Indexed for the
verify/sync query patterns — see **Performance & indexing**.

**Watermark table (new):**
```sql
CREATE TABLE corporate_action_sync_state (
  source          TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ NOT NULL
);
```

**Run algorithm (per source):**
1. Read `last_synced_at` for the source.
   - Present → `from = last_synced_at − 7 days` (overlap buffer for late/corrected
     actions).
   - Absent (first run) → `from = --from CLI arg ?? ~15 years ago`, chunked into
     sub-windows (NSE caps the range per query) — a one-time historical backfill.
     (Configurable `--from` so you can floor it at your earliest trade.)
   - `to = now`.
   - **BSE (`supportsHistory=false`):** ignore the `from` — the endpoint only
     returns forthcoming actions; each incremental run captures newly-announced
     BSE actions around their ex-date.
2. `source.fetchWindow(from, to)` — **market-wide**, throttled/chunked.
3. Keep only **equity split** and **equity bonus**. Precise filter (dividends,
   rights, buybacks, schemes ignored):
   - **Split:** subject is a face-value sub-division of the equity share →
     `factor = oldFaceValue / newFaceValue` ("From Rs 2 to Re 1" = 2).
   - **Bonus:** subject is an **equity** bonus `a:b` → `factor = (a + b) / b`
     (1:1 = 2, 1:2 = 1.5). **Exclude** non-equity bonuses — reject subjects
     containing `ncrps|preference|warrant|debenture|scheme of arrangement`
     (e.g. "Scheme Of Arrangement - Bonus Ncrps 4:1" is a *preference-share*
     bonus, NOT an equity factor — must never be applied).
   - Anything ambiguous → **not stored** (so it can never auto-apply; a real
     mismatch still surfaces via inferred → manual review).
4. **Upsert into `corporate_action_ref`** (idempotent on
   `(source, symbol, action_type, ex_date)`). No `stock_id` mapping here — the
   feed is stored raw by symbol/isin.
5. On success, set `last_synced_at = now`. **On failure, do not advance** the
   watermark — the next run re-covers the gap. No window is ever missed.

Steady state: each run pulls only `[last_synced_at − 7d, now]` market-wide —
cheap (single-digit splits/bonuses per week). The wide backfill happens once.

> Note: `corporate_action_ref` is the exchange feed. `corporate_actions` (from
> the prior spec, FK → `indian_stocks`) remains the set of actions **actually
> applied** to a user's positions — written only on verify/confirm, and read by
> the FIFO engine. The two are deliberately separate: global feed vs applied.

## Component 2 — Detection engine (pure, unit-tested)

`src/lib/import/corporate-action-detect.ts` — no DB, no network.

Input per account: trades, currently-known `CorporateActionContext`, and the
broker **`holdings`** table (the independent broker-statement quantity) for
cross-check. For each canonical security, run CA-aware FIFO with known actions,
then evaluate:

- **Signal A — oversold:** `adjustedSell > adjustedBuy + eps` ⇒ a share
  multiplier is missing. Candidate `F = adjustedSell / adjustedBuy`.
- **Signal B — holdings mismatch:** FIFO-open qty ≠ the broker `holdings`-table
  qty (same account + canonical security) by a clean ratio ⇒ candidate
  `F = holdingsQty / fifoOpenQty` (catches still-held cases). Only used when a
  `holdings` row exists for that security.
- **Signal C — cross-ISIN, same symbol:** an old ISIN net-positive plus a newer
  ISIN with sells ⇒ propose the `canonical_stock_id` link **and** the factor.

Then:
- **Ratio snapping:** snap `F` to the nearest plausible corporate-action ratio
  from a fixed set (`1.5, 2, 2.5, 3, 4, 5, 10, …`, incl. common face-value
  splits and bonus ratios).
- **Reconciliation guard:** emit a candidate **only if** applying the snapped `F`
  makes the security reconcile (nets to ~0 or matches holdings within tolerance).
  Otherwise emit `unexplained` (surfaced as "manual review", never applied).
- **Ex-date window:** `(last pre-action buy date, first oversell date)`.

Output: `CorporateActionCandidate[]`:
```
{ stock_id, symbol, action_type, factor, ex_date_window: {from,to},
  observed: { buys, sells, fifoOpen, holdings },
  status: 'verified' | 'inferred' | 'unexplained',
  matchedRef?: { ex_date, factor, source } }   // when a table row confirms it
```
A candidate is **verified** when **`corporate_action_ref`** has a split/bonus for
that security — matched by **symbol** (the stable key across ISIN changes; ISIN
used as a secondary match) — with ex-date in the window and a factor equal
(within tolerance) to the snapped `F`; otherwise **inferred**. Verification is a
DB read of the market-wide feed, not a network call.

## Component 3 — Import integration

In the per-account recompute path (after trades are inserted):
1. Run detection.
2. **Verified** candidates: upsert into `corporate_actions` (if not already
   present; `source` kept as the ref's), then recompute FIFO + snapshot.
3. **Inferred / unexplained** candidates: returned in the import result;
   **nothing is written**.

The batch import aggregates candidates across files/accounts into the response.

## Component 4 — Confirmation UX (import dialog)

A new **Corporate actions** section in `trade-import-dialog.tsx`, shown after the
summary when candidates exist:

- **✅ Auto-applied (verified):** one line each —
  *"TD Power — 1:2 split, ex 24-Aug-2026 — applied (source: NSE)."*
- **⚠️ Needs your confirmation (inferred):** a card with the math —
  *"You sold **200** TDPOWER but bought **100**. A **1:2 split (~Aug 2026)**
  explains it; avg buy price adjusts ₹X → ₹X/2."* with **[Apply] [Skip]** and an
  editable ratio/ex-date.
- **ℹ️ Manual review (unexplained):** listed, not actionable — *"sold more than
  bought and no clean split/bonus explains it; check the tradebook."*

**Apply** calls a server action `applyCorporateAction({ stock_id, action_type,
ex_date, factor })` → writes `corporate_actions` (`source='inferred'`) → sets the
`canonical_stock_id` link if the candidate spans two ISINs → recomputes FIFO +
snapshot → refreshes the dashboard.

## Data model changes — migration `007_corporate_action_source.sql`

```sql
-- Provenance on applied actions.
ALTER TABLE corporate_actions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('nse', 'manual', 'inferred'));

-- Market-wide exchange feed (decoupled from indian_stocks; keyed by symbol/isin).
CREATE TABLE IF NOT EXISTS corporate_action_ref (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source      TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  isin        TEXT,
  action_type TEXT NOT NULL CHECK (action_type IN ('split','bonus')),
  ex_date     DATE NOT NULL,
  factor      NUMERIC(20,8) NOT NULL CHECK (factor > 0),
  raw_subject TEXT,
  fetched_at  TIMESTAMPTZ DEFAULT now(),
  -- Dedup / upsert conflict target (also a composite btree index).
  UNIQUE (source, symbol, action_type, ex_date)
);

-- Hot path: verify a candidate → WHERE symbol = $1 AND ex_date BETWEEN $2 AND $3.
-- (symbol, ex_date) also serves symbol-only lookups via leftmost prefix. action_type
-- has only 2 values (low selectivity) so it stays a cheap residual filter, not a
-- lead column — revisit if the feed ever stores all action types.
CREATE INDEX IF NOT EXISTS idx_ca_ref_symbol_exdate
  ON corporate_action_ref (symbol, ex_date);
-- Secondary match by ISIN when the symbol is ambiguous/renamed.
CREATE INDEX IF NOT EXISTS idx_ca_ref_isin_exdate
  ON corporate_action_ref (isin, ex_date) WHERE isin IS NOT NULL;
-- Sync window scans / recency queries by ex_date across the whole feed.
CREATE INDEX IF NOT EXISTS idx_ca_ref_exdate
  ON corporate_action_ref (ex_date);

-- Readable by any authenticated user (global reference), writes via service role.
ALTER TABLE corporate_action_ref ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read corporate_action_ref"
  ON corporate_action_ref FOR SELECT TO authenticated USING (true);

-- Sync watermark.
CREATE TABLE IF NOT EXISTS corporate_action_sync_state (
  source          TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ NOT NULL
);
```
Candidates are **transient** (in the import response) — no candidates table.
Applied manually via the Supabase Dashboard, per project convention.

## Scope of securities

- **Detection** (Signals A/B/C) is **master-agnostic** — it runs on any traded
  security from its own trades, keyed by `stock_id` with an `isin` fallback. A
  stock missing from `indian_stocks`, or an unusual/thinly-held one, is still
  flagged.
- **The reference feed (`corporate_action_ref`)** is **market-wide**, so
  verification does not depend on a security being pre-loaded or held by anyone —
  this is what fixes the multi-tenant gap.
- **Applied actions (`corporate_actions`)** remain FK'd to `indian_stocks`; by the
  time an action is applied, the security exists in the master (import auto-creates
  it via `resolveStocks`).

**Exchange coverage:**
- **Dual-listed (NSE + BSE)** — corporate actions are per-security, so the **NSE
  historical feed** covers them; your BSE trades of the same stock match by
  ISIN/symbol. (Most held names are here.)
- **BSE-only** — no historical backfill (BSE endpoint is forthcoming-only, no
  ISIN). Past actions → inferred/confirm; future actions → captured incrementally
  by the BSE source and matched by **symbol** (BSE gives no ISIN).
- **Non-Indian markets** — future extension via the `CorporateActionSource`
  strategy (e.g. EODHD); out of scope for v1.

## Identity: matching across ISIN changes

A split/bonus usually **mints a new ISIN** (e.g. TD Power: trades `INE419M01027`,
holdings `INE419M01035`, feed `INE419M01019` — one company, three ISINs). ISIN is
therefore **not** a stable match key across exactly the events we care about. The
matching rule is:

1. **Match the feed to a security by SYMBOL first** (stable across splits/bonuses),
   ISIN as a secondary/confirmatory key. BSE rows (no ISIN) match by symbol only.
2. **Unify ISIN changes via `canonical_stock_id`** — Signal C proposes the
   old→new link when a symbol trades under two ISINs; the applied action lives on
   the canonical id.
3. **Reconciliation gate is the final authority** — an action is only applied if
   the factor makes the user's own buys/sells reconcile, so a mis-mapped feed row
   cannot corrupt positions.

**Edge — symbol rename** (ticker itself changes, rare): the feed under the new
symbol won't match old-symbol trades. Handled later by a **symbol-alias history**
on the security master (documented future extension, not v1). Symbol *reuse* is
disambiguated by ex-date window + the reconciliation gate.

## Performance & indexing

The feed can grow large (all NSE/BSE split/bonus history, both exchanges, many
years — and larger still if the feed is ever extended to all action types).
Every access path is indexed:

| Access path | Query | Index used |
|---|---|---|
| Verify a candidate (hot) | `symbol = $1 AND ex_date BETWEEN $2 AND $3` | `idx_ca_ref_symbol_exdate (symbol, ex_date)` |
| Secondary ISIN match | `isin = $1 AND ex_date BETWEEN …` | `idx_ca_ref_isin_exdate (isin, ex_date)` partial |
| Sync upsert / dedup | `ON CONFLICT (source, symbol, action_type, ex_date)` | `UNIQUE (source, symbol, action_type, ex_date)` |
| Sync window / recency | `ex_date >= $1` | `idx_ca_ref_exdate (ex_date)` |

Rules that keep it fast at scale:
- **Verification is always symbol- (or isin-) scoped + date-bounded** — never a
  full-table scan. Detection queries the feed only for the securities in the
  current import (tens), each an index seek.
- **Batch the verify lookups.** For an import touching N securities, fetch their
  ref rows in **one** `WHERE symbol = ANY($1) AND ex_date BETWEEN …` query rather
  than N round-trips.
- **`loadCorporateActionContext` must not `SELECT *` the applied table at scale.**
  Change it to filter `corporate_actions` by the `stock_id`s in the current
  import/account (uses `idx_corporate_actions_stock`), instead of loading every
  row. (`corporate_actions` is small today — applied actions only — but this
  removes the latent full-scan.)
- **`corporate_action_ref` is append/upsert-only** from the sync; no per-request
  writes, so write contention is a non-issue.
- Consider **`ex_date` range partitioning** only if the feed genuinely reaches
  many millions with all action types — not needed for split/bonus-only v1;
  called out so it's a conscious future lever, not a silent limit.

## Trust & failure handling

- **Never auto-apply an inferred action** — only reference-verified ones.
- The **reconciliation guard** prevents false positives on normal books.
- **Sync failure is non-fatal:** the table simply isn't refreshed; detection
  still infers and asks. Watermark doesn't advance, so no gap is lost.
- **Dividends filtered** at parse time.
- **Wrong reference data:** even a verified action is only applied if the snapped
  `F` from the user's own trades matches the reference factor — the user's data
  is the final check, so a bad reference row can't silently corrupt positions.

## Testing (TDD)

- Detection engine: oversold, holdings-mismatch, cross-ISIN, ratio snapping,
  reconciliation guard, and **no false positive on a clean fully-reconciled
  book**.
- NSE `subject` → factor parsing (splits "From Rs X to Re Y", bonus "a:b");
  dividends filtered out.
- Sync: watermark first-run (chunked backfill) vs incremental window; idempotent
  upsert into `corporate_action_ref`; watermark not advanced on failure.
- Verification: a candidate matches a `corporate_action_ref` row by symbol +
  ex-date-in-window + factor → verified; no match → inferred.
- Import integration: verified auto-applies + recomputes; inferred returned, not
  written; `applyCorporateAction` writes + recomputes.

## Risks / open items

- **Offline freshness (not coverage):** because the feed is market-wide, coverage
  is complete for any traded stock; the only lag is *recency* — an action whose
  ex-date is after the last sync run falls back to "inferred → confirm" until the
  next run. Self-healing.
- **Inference ambiguity:** multiple actions on one security, or partial positions
  spanning an action, can make `F` ambiguous — the reconciliation guard + user
  confirmation contain this; unreconcilable cases become "manual review".
- **Ex-date precision when inferred:** only a window is known without reference
  data; the user can edit it on the confirm card.
- **Symbol reuse / renames over time** could mis-map an NSE action to the wrong
  security; mapping is via the current stock master and validated by the
  reconciliation guard.
