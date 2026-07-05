# Explore Stories — Master Catalog & Design

**Date:** 2026-07-05
**Status:** Approved catalog → drafting Tier 1
**Goal:** Add a set of pain-point "explore stories" (SEO landing pages, like the existing three) so that a serious Indian value investor lands, thinks *"that's me,"* signs in with Google, and — because each story now carries a short **how-to** — also learns how to do the thing. Every story maps to a *real* feature and a *real* pain (see `docs/product-overview.md`). No buy/sell recommendations; the product gives the user the tool to decide for themselves.

---

## 1. What already exists (do not rebuild)

Stories are Next.js pages under `src/app/(marketing)/`, built on `SubPageShell` (hero + one live faux-UI demo + body sections + cross-links + FAQ + JSON-LD). Three ship today:

| Existing page | Pain points it already owns |
|---|---|
| `/zerodha-portfolio-tracker` | Multi-account consolidation, one-click import |
| `/portfolio-allocation` | Under/over-allocated, rebalance/move-cash, star-bucket allocation |
| `/intrinsic-value-margin-of-safety` | Live valuations, bull/base/bare scenarios, anti-"dead PDF" |

Reusable demo library already built (`src/components/marketing/demos/`): `AllocationDemo`, `LiveValuationDemo`, `DashboardScanDemo`, `ZerodhaImportDemo`, `TimelineDemo`, `UnifiedCompanyDemo`, `DemoShell`.

---

## 2. Design decisions (locked)

1. **Show the product two ways per story:** the existing animated **faux-UI demo** (concept) **plus** a **masked real screenshot** (`ProofShot`) as "this is the actual product, names hidden."
2. **Each story doubles as a user guide:** a compact numbered **`HowTo`** block ("How to do this in StockTracker") — serves the sign-in *and* onboarding goals in one page.
3. **Catalog first, then draft one-by-one.** Tier 1 first.

### Per-story template
Each new page uses `SubPageShell` and fills its `children` slot in this order:
`ValuePoints` → **`<ProofShot>`** → **`<HowTo>`**. Result: hero + live demo → value points → masked screenshot → how-to → cross-links → FAQ. Two new shared components, built once and reused:

- **`ProofShot`** (`src/components/marketing/proof-shot.tsx`) — themed browser-frame around a `next/image` of a masked screenshot; one-line caption ("Real StockTracker screen — company names masked"); `overflow-x-auto`; descriptive `alt`. Static local asset only (no uploads).
- **`HowTo`** (`src/components/marketing/how-to.tsx`) — heading + ordered list of steps `{ title, body }`; numbered badges in `primary`; works in both themes.

Add `SubPageShell.ALL` entries + `sitemap.ts` + `seo.ts` keywords for every new route (matches existing pattern).

---

## 3. The catalog

### Tier 1 — net-new, strong persona + keyword, demo already exists (DRAFT THESE FIRST)

**S1 · Watchlist & live BUY signal** — `/watchlist-buy-signal`
- **Pain / hook:** "You researched 40 companies. Which one just got cheap enough to buy?"
- **Persona:** Watchlist Hunter. **Covers:** #6.
- **Features:** watchlist portfolio (same research depth as holdings), target buy price (manual or model-derived), live MoS, green **BUY** badge when CMP ≤ target, Signal column, `Move to Holdings`.
- **Demo:** `DashboardScanDemo` (MoS flips red→green, BUY appears).
- **ProofShot:** dashboard in **watchlist mode** showing the Signal/BUY column (names masked).
- **HowTo:** 1) Create a Watchlist portfolio · 2) Add a company + set target buy (or let the base-case model set it) · 3) Watch the Signal column — BUY appears the moment price crosses · 4) `Move to Holdings` when you buy.
- **Keywords:** stock watchlist with buy alerts, target price tracker India, when to buy a stock.

**S2 · Quarterly timeline & earnings tracking** — `/quarterly-earnings-timeline`
- **Pain / hook:** "Did management actually walk the talk — or just talk?"
- **Persona:** Quarterly Tracker / Analyst. **Covers:** #8, #9.
- **Features:** dated, labelled timeline entries (`Q1FY26`, `Annual Report`, `Concall`), rich text, **embedded images / attached PDFs / URLs**, newest-first, per-company institutional memory.
- **Demo:** `TimelineDemo`.
- **ProofShot:** a company **Timeline tab** with quarter chips + 📄/📊/🔗 attachment chips (names masked).
- **HowTo:** 1) Open a company → Timeline · 2) Add an entry, label the quarter · 3) Paste concall notes, embed the slide, attach the PDF/AR · 4) Next quarter, scroll the arc — guidance vs. delivery at a glance.
- **Keywords:** quarterly results tracker, concall notes app, earnings tracking India.

**S3 · Your whole research file on one page** — `/stock-research-organizer`
- **Pain / hook:** "Thesis in Notes. Model in Excel. Targets in a PDF. Holdings in Zerodha."
- **Persona:** Concentrated Long-Term Investor. **Covers:** #10 (Highlights folds in here).
- **Features:** one tabbed company workspace — Details/header verdict (CMP, target buy, MoS, BUY, stars, IRR), **Thesis** (rich text), **Projections & Valuations**, **Timeline**, **Highlights** (conviction TL;DR surfaced on dashboard), **Holdings**.
- **Demo:** `UnifiedCompanyDemo` (scattered cards snap into one page).
- **ProofShot:** company detail page showing the tab row + header verdict (names masked).
- **HowTo:** 1) Add a company · 2) Write the thesis · 3) Build the model · 4) Log the quarter · 5) Pin the 2–3 things that would make you buy more in Highlights.
- **Keywords:** stock research organizer, investment thesis tracker, one place for stock research.

**S4 · Your valuation model, out of the spreadsheet** — `/stock-valuation-model`
- **Pain / hook:** "Stop re-typing the same formulas in a new sheet for every company."
- **Persona:** Analyst / modeler. **Covers:** #11.
- **Features:** multi-year projections grid (enter drivers → app computes PAT, margins, growth), **two frameworks — PE/Earnings and EV/EBITDA**, multiple models per company w/ a default, **forward PEG** sanity check, back-solved buy price from required return, bull/base/bare.
- **Demo:** `LiveValuationDemo` (reused) — optionally a small new `ProjectionGridDemo` later.
- **ProofShot:** the **Projections & Valuations tab** (grid + bull/base/bare table) (names masked).
- **HowTo:** 1) Open a company → Projections & Valuations · 2) Pick PE or EV/EBITDA · 3) Enter the drivers · 4) Set target multiples for bull/base/bare · 5) Read your buy price + IRRs — they recompute when you revise after results.
- **Keywords:** stock valuation model, EV/EBITDA calculator, PEG ratio tool, intrinsic value spreadsheet alternative.

### Tier 2 — SEO magnets / distinct angle (decide after Tier 1)

**S5 · One household, several demat accounts** — `/family-portfolio-multiple-demat`
- Deeper cut of the Zerodha page: consolidation across self/spouse/HUF, cost-weighted average, per-account drill-down + account filter. Demo: `ZerodhaImportDemo` account chips. Keywords: family portfolio tracker, multiple demat accounts.

**S6 · Replace your stock-tracking spreadsheet** — `/stock-portfolio-excel-alternative`
- Broad SEO magnet tying everything together (model + allocation + timeline vs. one fragile sheet). Reuses `UnifiedCompanyDemo`/`AllocationDemo`. Keywords: portfolio tracker excel alternative, stock spreadsheet replacement.

**S7 · Your advisor's report was frozen the day it printed** — `/living-research-report`
- Research-service-subscriber persona; take a static advisory PDF's target/MoS and make it breathe with the price. Overlaps `/intrinsic-value-…` but distinct persona + keyword. Demo: `LiveValuationDemo` (ghosted static-PDF contrast). Keywords: stock advisory tracker, research report to live model.

**Fold-ins (not standalone pages):** Highlights → section in S3; multiple portfolios + privacy/RLS → supporting sections/FAQ.

---

## 4. Screenshots — handling

Default (unblocked drafting): each `ProofShot` ships with a **labeled placeholder** + an exact capture spec (which screen, what to show). User sends **masked** screenshots after; they drop into `public/marketing/screenshots/` (new dir) and are referenced via `next/image`. Masking (company names + PII) is done by the user before sending; if we later automate masking server-side, that's a separate effort with its own path-traversal/data-exposure review. **No real financial claims** — captions state names are masked and figures are illustrative where relevant.

---

## 5. File plan (Tier 1)

```
src/components/marketing/proof-shot.tsx                          (new, shared)
src/components/marketing/how-to.tsx                              (new, shared)
src/app/(marketing)/watchlist-buy-signal/page.tsx               (S1)
src/app/(marketing)/quarterly-earnings-timeline/page.tsx        (S2)
src/app/(marketing)/stock-research-organizer/page.tsx           (S3)
src/app/(marketing)/stock-valuation-model/page.tsx              (S4)
public/marketing/screenshots/                                   (new dir; masked shots land here)

edits:
src/components/marketing/sub-page-shell.tsx   (add new routes to ALL cross-link list)
src/app/sitemap.ts                            (add 4 routes)
src/lib/seo.ts                                (add keywords / pageMeta as needed)
src/lib/supabase/middleware.ts                (add each route to MARKETING_PATHS — REQUIRED, else it 302s to /login and isn't crawlable)
```

## 6. Non-functionals (inherit existing standards)
Both light + dark via tokens; mobile-first, no horizontal scroll; reduced-motion respected; one `<h1>`/page; descriptive `alt`/`aria-label`; JSON-LD (Breadcrumb + FAQ) per page; outbound `target="_blank"` links get `rel="noopener noreferrer"`; no new dependencies; CI gate (lint/typecheck/build) passes.

## 7. Batch order
1. Build shared `ProofShot` + `HowTo`.
2. Draft **S1 → S2 → S3 → S4**, one at a time, each reviewed before the next.
3. Wire cross-links + sitemap + SEO as each ships.
4. Revisit Tier 2 (S5–S7) after Tier 1 is approved.
