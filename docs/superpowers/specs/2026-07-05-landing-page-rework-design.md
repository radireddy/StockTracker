# StockTracker Landing Page Rework — Design Spec

**Date:** 2026-07-05
**Status:** Approved design → implementation
**Goal:** Rework the marketing site so it (a) resonates instantly with the pains real Indian value investors face, (b) *shows* the product with live faux-UI mockups instead of walls of text, and (c) improves SEO via a small multi-page footprint. Every visitor should think "that's me" and sign in.

---

## 1. Scope

- Rework the existing home page (`src/app/page.tsx`).
- Add **3 dedicated SEO landing pages** under a `(marketing)` route group.
- Build a library of **live faux-UI demo components** (pure client-side, no backend) reused across all four pages.
- Expand SEO metadata, structured data, sitemap, and internal linking.
- **No new dependencies.** Animations use Tailwind + `tw-animate-css` + a tiny `IntersectionObserver` hook. Carousel is hand-rolled.
- Auth stays one-click Google OAuth via the existing `GoogleCta`.

Out of scope: changing the authenticated app, adding a blog/CMS, pricing pages, real interactive backends.

---

## 2. Page structure & SEO footprint

| Route | Primary keyword | Angle |
|---|---|---|
| `/` | "stock portfolio tracker India" | Full story: rotating hero → demos → personas → FAQ → CTA |
| `/zerodha-portfolio-tracker` | "Zerodha holdings tracker", "import Zerodha holdings" | Import → live consolidated portfolio |
| `/intrinsic-value-margin-of-safety` | "intrinsic value calculator", "margin of safety" | Live valuation + bull/base/bare, anti-"dead PDF" |
| `/portfolio-allocation` | "portfolio allocation", "rebalancing" | Conviction-weighted allocation engine |

Each sub-page: own `<title>` / description / canonical, a focused hero (single relevant demo), a trimmed FAQ subset, a "see everything" link back to `/`, and cross-links to the other two sub-pages. All four routes added to `sitemap.ts`.

Route group `src/app/(marketing)/` holds the three sub-pages; `/` stays at `src/app/page.tsx` (it already renders its own full shell). A shared marketing layout is **not** required — pages compose shared components directly to keep each route independently cache-friendly.

---

## 3. Content mapping — personas × pains × features

The auto-rotating hero cycles through 6 problem→solution screens. Each maps to a persona and surfaces specific features. Nothing is left uncovered.

| # | Hero headline (pain) | Persona | Features surfaced | Demo used |
|---|---|---|---|---|
| 1 | "Your research report was obsolete the day it was printed." | Research-service subscriber | Live-recompute valuation, MoS, IRR (vs static PDF) | LiveValuationDemo |
| 2 | "You have ₹5L to invest. Which stock? How much?" | Rebalancer / capital deployer | Allocation RangeBars, rupee-precise delta, star-rating bands | AllocationDemo |
| 3 | "Thesis in Notes. Model in Excel. Targets in a PDF. Holdings in Zerodha." | Concentrated long-term investor | Unified company page: thesis + projection model + valuation | UnifiedCompanyDemo |
| 4 | "Is it still a buy after today's move?" | Watchlist hunter | Live BUY signal, target buy price, MoS flip red→green | DashboardScanDemo |
| 5 | "31 companies. Every quarter. Where did I write that down?" | Quarterly tracker / analyst | Timeline (image/PDF/URL), projections grid, forward PEG | TimelineDemo |
| 6 | "Same stock across three demat accounts. What do I actually own?" | Multi-account household manager | Zerodha import, cross-account consolidation, per-account drill-down | ZerodhaImportDemo |

**Feature coverage checklist** (every one appears in a demo, hero screen, or the feature/persona strip):
one-click Zerodha import · multi-account consolidation · re-import refresh · manual holdings · dashboard P&L bar · sortable/filterable companies table · MoS % (color-coded) · base & bare IRR · BUY signal / target buy price · star-rating conviction (1–4) · Core/Satellite strategy · investment horizon · allocation RangeBars · invested % vs current % basis · configurable target bands per star · rupee-precise delta hints · allocation summary bar · bull/base/bare valuation scenarios · target PE / EV-EBITDA models · multi-year projection grid (PAT, margins, growth) · forward PEG · live recompute on price change · rich-text thesis · timeline with image/PDF/URL · highlights on dashboard · watchlist vs holdings · move-to-holdings · privacy/RLS · free · Google sign-in.

---

## 4. Hero carousel (`hero-carousel.tsx`, client component)

- Cycles the 6 screens every ~5s. **Pauses on hover/focus.** Dot indicators + prev/next affordance. Left/right swipe on touch.
- **Accessibility:** respects `prefers-reduced-motion` (no auto-advance; shows screen 1 with manual dots). Slides use `aria-roledescription="slide"`, live region announces current slide, controls are real buttons.
- Layout: two-column on `md+` (headline + subcopy + CTA on the left, live mini-mockup on the right); stacked on mobile (mockup below text). Fixed min-height so rotation doesn't cause layout shift (reserve for the tallest screen).
- Each screen: eyebrow chip, `h1`-class headline (only screen 1 is the real `<h1>`; others are visually-identical `<p>` to keep one `h1`/page), one-sentence subcopy, `Continue with Google` CTA + a secondary text link to the matching demo/section.
- Crossfade/slide transition via CSS classes from `tw-animate-css`; no JS animation library.

---

## 5. Live faux-UI demo components

All under `src/components/marketing/demos/`. Shared traits:
- **Pure client-side, no network.** Hardcoded illustrative Indian-stock data (fictional/representative — no claim of real prices).
- Use real design tokens (`primary` teal, `destructive` red, `chart-*` greens, `muted`, `border`, `card`). Match the app's density and typography so they read as the actual product.
- **Animate on scroll** via a shared `useInView` hook (`IntersectionObserver`, fires once). All motion is gated behind `prefers-reduced-motion` → static final state.
- Each demo is self-contained, `aria-label`ed, and captioned with **one headline + one sentence** max.
- Fixed dimensions / `overflow-x-auto` wrappers so nothing causes horizontal page scroll on mobile.

### 5.1 `AllocationDemo`
Mini dashboard table: company · star · current % · target band · **RangeBar** · status. On scroll, bars animate to position; under-allocated rows glow and reveal "add ₹1.8L–₹3.4L". A small toggle flips basis Invested ↔ Current. Proves the conviction→band→rupee-delta loop.

### 5.2 `LiveValuationDemo`
Bull/base/bare table (target PE → target market cap → IRR → buy price) beside a CMP that auto-ticks. As CMP moves, **buy price, MoS, IRR, and the BUY badge recompute live**. A ghosted "static PDF" version sits behind it, frozen, to dramatize the contrast. This is the anti-"dead numbers" centerpiece.

### 5.3 `DashboardScanDemo`
Compact companies table with columns Qty · CMP · Target Buy · MoS% · Base IRR · Bare IRR, plus star/strategy filter chips. One row's MoS flips red→green and a green **BUY** badge appears — the "60-second morning scan".

### 5.4 `ZerodhaImportDemo`
A Zerodha statement card "uploads" → holding rows stream in → account chips appear (e.g., "Self", "Spouse", "HUF") → portfolio P&L bar fills. Shows import + auto-create + multi-account consolidation in one motion.

### 5.5 `TimelineDemo`
Reverse-chronological entry stack with quarter chips (Q1FY26, Annual Report, Concall) and attachment chips (📊 image, 📄 PDF, 🔗 URL). Conveys "living quarterly memory".

### 5.6 `UnifiedCompanyDemo`
Four scattered cards (Notes / Excel / PDF / Zerodha) that snap together into one tabbed company page (Details · Thesis · Projections · Timeline · Highlights). Conveys consolidation.

---

## 6. Supporting sections (home page)

1. **Rotating hero** (§4).
2. **"Which one are you?" personas strip** — 6 compact cards, one line each, each linking to the most relevant demo/sub-page. High resonance, low text.
3. **Demo sections** — the 6 demos, each with a short headline + sentence, alternating image side on desktop.
4. **Feature grid** — condensed grid covering any features not carried by a demo (privacy/RLS, free, Google sign-in, watchlist↔holdings, PEG, horizon). Keyword-rich but brief.
5. **Spreadsheet-replacement band** — kept from current page, tightened.
6. **FAQ** (`faq.tsx`, shared) — expanded set incl. "Do the numbers update with price?", "Can it track multiple demat accounts?", "How does allocation work?".
7. **Footer** with internal links to the 3 sub-pages (SEO interlinking).

---

## 7. SEO implementation

- `src/lib/seo.ts`: expand `SITE_KEYWORDS`; add a `pageMeta(route)` helper returning per-page `title`/`description`/`canonical`/`keywords`.
- **Structured data:** keep `SoftwareApplication` + `Organization` + `FAQPage` on `/`; add `BreadcrumbList` on sub-pages, and an `ItemList`/`FeatureList` of core features on `/`. Reuse the existing nonce'd JSON-LD `<script>` pattern (escape `<`).
- One `<h1>` per page; `h2` per section; descriptive `aria-label`/alt on every demo (screen readers + image SEO).
- Internal links: home ↔ all sub-pages ↔ each other. `sitemap.ts` lists all four with sensible `priority`.
- Copy weaves target keywords naturally into headings and subcopy (no stuffing).

---

## 8. File plan

```
src/app/page.tsx                                              (rework)
src/app/(marketing)/zerodha-portfolio-tracker/page.tsx        (new)
src/app/(marketing)/intrinsic-value-margin-of-safety/page.tsx (new)
src/app/(marketing)/portfolio-allocation/page.tsx             (new)

src/components/marketing/hero-carousel.tsx                    (new, client)
src/components/marketing/personas-strip.tsx                   (new)
src/components/marketing/faq.tsx                              (new, shared)
src/components/marketing/feature-grid.tsx                     (new)
src/components/marketing/section-heading.tsx                  (new, small)
src/components/marketing/demos/allocation-demo.tsx            (new, client)
src/components/marketing/demos/live-valuation-demo.tsx        (new, client)
src/components/marketing/demos/dashboard-scan-demo.tsx        (new, client)
src/components/marketing/demos/zerodha-import-demo.tsx        (new, client)
src/components/marketing/demos/timeline-demo.tsx              (new, client)
src/components/marketing/demos/unified-company-demo.tsx       (new, client)
src/hooks/use-in-view.ts                                      (new, IntersectionObserver)

src/lib/seo.ts                                                (expand)
src/app/sitemap.ts                                            (add routes)
```

---

## 9. Non-functional requirements

- **Performance:** demos are lightweight, animate only when in view, and unmount nothing critical. No layout shift (reserve hero height). No heavy libs. Keep client JS minimal — server-render all static copy; only carousel + demos are client components.
- **Accessibility:** WCAG-minded. Reduced-motion respected everywhere. Color is never the only signal (BUY badge has text; status has labels).
- **Responsive:** mobile-first; every table/mockup wrapped in `overflow-x-auto`; page body never scrolls horizontally.
- **Dark mode:** all demos work in both themes via tokens.
- **CSP:** honor existing nonce for any inline JSON-LD.
- **No real financial claims:** demo data is clearly representative/fictional.

---

## 10. Testing / verification

- Typecheck + lint + build pass (existing CI gate).
- Manual: verify all 4 routes render, hero rotates + pauses on hover, reduced-motion disables auto-advance, demos animate on scroll, no horizontal scroll on 360px width, dark mode intact, CTA triggers Google OAuth.
- Verify JSON-LD validates (structure) and sitemap includes all routes.
