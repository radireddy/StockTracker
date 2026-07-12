# Allocation Calculator — Design Spec

**Date:** 2026-07-12
**Status:** Approved
**Scope:** New public marketing page with an interactive allocation calculator and post-result marketing pitch for unauthenticated users.

---

## Overview

A standalone calculator page at `/allocation-calculator` that lets any visitor (logged in or not) plan how much to allocate per conviction bucket before investing. After results are shown, unauthenticated users see a marketing pitch bridging the plan to what StockTracker delivers live.

A "Calculator" link is added to `SiteHeader` for discoverability.

---

## Routing & Files

| File | Purpose |
|---|---|
| `src/app/(marketing)/allocation-calculator/page.tsx` | SSG page: metadata + shell layout |
| `src/components/marketing/allocation-calculator.tsx` | `"use client"` component: all form state, calculation, auth detection, pitch |

Fits the existing `(marketing)` route group pattern. No API routes, no DB calls, no server-side session check. Fully statically renderable; interactive part loads client-side.

---

## SiteHeader Change

Add a "Calculator" link to `src/components/marketing/site-header.tsx` between "Features" and the theme switcher.

- Style: `hidden sm:block text-sm text-muted-foreground transition-colors hover:text-foreground` (matches "Features" link)
- Label: "Calculator"
- href: `/allocation-calculator`

---

## Page Layout

Narrow centered layout (`max-w-2xl`) — no hero grid, no demo screenshot beside it.

```
[SiteHeader]

Hero (centered)
  eyebrow : "Free tool"
  h1      : "Stock allocation calculator"
  sub     : "See how much to put in each conviction bucket
             before you invest a single rupee."

Calculator card
  └─ Inputs (see below)
  └─ Results (appear after Calculate click)

Marketing pitch card  ← non-auth users only, below results

[SiteFooter]
```

---

## Calculator Inputs

### Primary inputs (always visible)

| Field | Type | Validation |
|---|---|---|
| Total investment amount | Number input | Required; > 0 to enable Calculate |
| Count: 4★ stocks | Integer input | Min 0, default 0 |
| Count: 3★ stocks | Integer input | Min 0, default 0 |
| Count: 2★ stocks | Integer input | Min 0, default 0 |
| Count: 1★ stocks | Integer input | Min 0, default 0 |

### Advanced section (collapsed by default)

Label: "Adjust allocation ranges"

One row per star rating with two number inputs: `min %` — `max %`.

Default values (from `DEFAULT_ALLOCATION_RANGES`):

| Star | Min % | Max % |
|---|---|---|
| 4★ | 6 | 8 |
| 3★ | 4 | 6 |
| 2★ | 2 | 4 |
| 1★ | 0 | 2 |

Help text below the advanced section:
> "To target a fixed percentage (not a range), set both min and max to the same value — e.g. min 8% max 8%."

### Validation (inline, non-blocking)

- `min > max` on any row → inline red note on that row; that bucket shows "—" in results
- Total deployed max > total amount → amber warning: "Your targets exceed your total — reduce stock counts or percentages"
- Amount empty or 0 → Calculate button disabled

---

## Calculation Logic

All math runs client-side on Calculate click. No currency symbols in any output — numbers only.

### Per-bucket

```
perStockMin(star) = range(star).min / 100 × totalAmount
perStockMax(star) = range(star).max / 100 × totalAmount
bucketMin(star)   = count(star) × perStockMin(star)
bucketMax(star)   = count(star) × perStockMax(star)
```

### Summary

```
totalDeployedMin = Σ bucketMin  (buckets where count > 0)
totalDeployedMax = Σ bucketMax  (buckets where count > 0)
isOverAllocated  = totalDeployedMax > totalAmount
cashBufferMin    = max(0, totalAmount - totalDeployedMax)
cashBufferMax    = max(0, totalAmount - totalDeployedMin)
```

### Display rules

- Buckets where `count === 0` are hidden from results.
- If `range.min === range.max` → show single value, not a range (e.g. "40,000" not "40,000 – 40,000").
- `isOverAllocated` → amber warning "Targets exceed your total — reduce stock counts or percentages" (shown above the summary row).
- `cashBufferMin === cashBufferMax === 0 && !isOverAllocated` → green note "Fully deployed — no cash buffer".
- All numbers formatted with Indian locale (`en-IN`) using existing `fmtAmountShort` utility, **no currency symbol**.
- Results reset (hidden) when any input changes; user must click Calculate again.

### Results table columns

| Star | Count | Per stock | Bucket total |
|---|---|---|---|
| ★★★★ | 2 | 30,000 – 40,000 | 60,000 – 80,000 |
| … | … | … | … |

Summary row below the table:
```
Targeting X – Y of Z total (AA% – BB%)
Cash buffer: X – Y (AA% – BB%)
```

---

## Auth Detection

Client-side only via `createClient()` (Supabase browser client) on component mount. If session is null when results are shown, render the marketing pitch below results. No SSR session check needed — this is a public page.

---

## Marketing Pitch (non-auth users)

Rendered immediately below results, separated by a subtle divider.
Card style: `border-primary/20 bg-primary/[0.03]` — visually distinct but not jarring.

### Content

**Label (small, above headline):** "Your portfolio, live"

**Headline:**
> "This is the plan. StockTracker shows you how you're tracking against it — live."

**Three value points (icon + heading + one line each):**

1. **Import from Zerodha in seconds**
   Upload your holdings statement — your actual positions appear instantly, no manual entry.

2. **See exactly where you're off-target**
   Every bucket shows current weight vs. your conviction range. Under or over, flagged by name.

3. **Know the exact amount to add or trim**
   Not "rebalance" — the precise number for each stock to bring it into range.

**CTA button:** `GoogleCta` component — "Continue with Google — it's free"
(Same primary style as rest of site)

**Micro-copy below button:**
> "No credit card. No spreadsheet. Your first portfolio is free."

### Tone

The pitch continues the user's own thought — "you just calculated a plan, now see if you're actually on it" — rather than listing features. Bridges calculator output directly to app value.

---

## Research: Unallocated Amount Handling

Reviewed M1 Finance, OwlCalculator, and traditional asset allocation tools. Key finding: conviction-based per-stock allocation is fundamentally different from a pie model — the remaining amount is *intentional* (cash buffer / future purchases), not an error. Decision: show cash buffer as useful information, warn (not block) only if targets exceed 100% of total.

---

## SEO

### Target search intent

The page targets three overlapping intents:
- **Calculator/tool:** "stock allocation calculator india", "portfolio allocation calculator", "position sizing calculator india"
- **How-to:** "how much to invest in each stock", "how to size stock positions", "how to allocate money in stocks india"
- **Concept:** "conviction based position sizing", "star rating portfolio allocation", "portfolio sizing by conviction"

### Page metadata

```ts
title:       "Stock Allocation Calculator — Size Positions by Conviction"
description: "Free stock allocation calculator for Indian investors. Enter your total amount, number of stocks per conviction tier, and target weight bands — get exact rupee allocations per bucket instantly. No sign-up needed."
keywords:    [
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
]
canonical:   "/allocation-calculator"
openGraph:   { title, description, url: canonical("/allocation-calculator") }
```

### Structured data (JSON-LD)

Use `JsonLd` component (same as all sub-pages) with four graphs:
1. `BreadcrumbList` — Home › Stock Allocation Calculator (via `breadcrumbJsonLd`)
2. `FAQPage` — 4 calculator-specific Q&A pairs (via `faqJsonLd`)
3. `SoftwareApplication` — product identity (via `softwareApplicationJsonLd`)
4. `Organization` — (via `organizationJsonLd`)

Do NOT use `SubPageShell` — the page has its own narrow layout. Import the JSON-LD helpers directly from `@/lib/seo`.

### FAQ content (for FAQPage schema + visible FAQ section)

| Q | A |
|---|---|
| How does the stock allocation calculator work? | Enter your total investment amount, the number of stocks in each conviction tier (1–4 stars), and optional target weight bands per tier. The calculator shows how much to allocate to each bucket in total and what remains as a cash buffer. |
| What percentage of portfolio should I put in each stock? | A common conviction-based approach: 6–8% per 4-star holding, 4–6% per 3-star, 2–4% per 2-star, and 0–2% per 1-star. These are the defaults in this calculator — you can adjust them to match your own style. |
| What is conviction-based position sizing? | Instead of equal-weighting every stock, you size positions according to how strongly you believe in each one. Higher-conviction names get a larger target weight; speculative positions stay small. The star-rating system is one way to express that conviction as a number. |
| What is the cash buffer in the results? | The cash buffer is the portion of your total investment not assigned to any star bucket. It represents uninvested capital — useful as dry powder for future opportunities or to stay under your total. |

### Static copy for crawlers

The page must include at least one paragraph of static (server-rendered) text below the hero and above the calculator card, so search engines index the page's topic even before the client-side calculator loads. Suggested copy:

> "This calculator turns your conviction-based star ratings into concrete rupee targets. Set how many 4-star, 3-star, 2-star, and 1-star stocks you hold, adjust the target weight band for each tier, and see exactly how much to deploy per bucket — along with how much stays as a cash buffer."

### Sitemap

Add `/allocation-calculator` to `src/app/sitemap.ts` with `changeFrequency: "monthly"` and `priority: 0.8` — same as other marketing sub-pages.

### Cross-links

Add `allocation-calculator` to the `ALL` array in `src/components/marketing/sub-page-shell.tsx` so it appears in the "Explore more" cross-link strips on every other marketing sub-page.
Label: "Stock allocation calculator"

---

## Out of Scope

- Saving/persisting calculator inputs
- Sharing results via URL
- Integration with authenticated portfolio data
- Per-stock breakdown within a bucket
