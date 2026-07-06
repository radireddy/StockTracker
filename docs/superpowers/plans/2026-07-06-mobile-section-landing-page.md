# Mobile Section — Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a staggered three-phone screenshot strip to the home page that positions StockTracker as mobile-first.

**Architecture:** A single self-contained server component (`MobileSection`) renders three phone screenshots from `public/screenshots/` using Next.js `<Image>`. It is inserted directly in `page.tsx` between `<FeatureGrid />` and the spreadsheet CTA. No client state, no data fetching, no new routes.

**Tech Stack:** Next.js 15 App Router, `next/image`, Tailwind CSS v4, existing `SectionHeading` component.

## Global Constraints

- Screenshots are 440×920px — use these intrinsic dimensions, scaled down for display via `width`/`height` props on `<Image>`.
- No `@testing-library/react` is installed; coverage only applies to `src/lib/**` and `src/types/**` — no React component unit test required.
- Do not add rounded corners or box-shadow CSS to the `<Image>` elements — the phone bezel and shadow are baked into the PNGs.
- Section background: `border-t` with default `bg-background` (FeatureGrid is `bg-card`, so this alternates correctly).
- `SectionHeading` signature: `{ eyebrow?: string; title: string; sub?: string }`.

---

### Task 1: Copy screenshots into `public/`

**Files:**
- Create: `public/screenshots/mobile-holdings.png`
- Create: `public/screenshots/mobile-watchlist.png`
- Create: `public/screenshots/mobile-filter-expanded.png`

**Interfaces:**
- Produces: Three static assets served at `/screenshots/mobile-holdings.png`, `/screenshots/mobile-watchlist.png`, `/screenshots/mobile-filter-expanded.png`.

- [ ] **Step 1: Create the screenshots directory and copy files**

```bash
mkdir -p public/screenshots
cp docs/mockups/screenshots/mobile-holdings.png public/screenshots/
cp docs/mockups/screenshots/mobile-watchlist.png public/screenshots/
cp docs/mockups/screenshots/mobile-filter-expanded.png public/screenshots/
```

- [ ] **Step 2: Verify files are present and correct size**

```bash
ls -lh public/screenshots/
```

Expected output (sizes approximate):
```
mobile-filter-expanded.png   ~200K
mobile-holdings.png          ~200K
mobile-watchlist.png         ~200K
```

- [ ] **Step 3: Commit**

```bash
git add public/screenshots/
git commit -m "feat(marketing): add mobile phone screenshots to public assets"
```

---

### Task 2: Build the `MobileSection` component

**Files:**
- Create: `src/components/marketing/mobile-section.tsx`

**Interfaces:**
- Consumes: `SectionHeading` from `@/components/marketing/section-heading`, `Image` from `next/image`, static assets at `/screenshots/*.png`.
- Produces: `export function MobileSection(): React.JSX.Element` — a `<section>` element, no props.

- [ ] **Step 1: Create the component file**

Create `src/components/marketing/mobile-section.tsx` with the following content:

```tsx
import Image from "next/image";
import { SectionHeading } from "./section-heading";

export function MobileSection() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <SectionHeading
          eyebrow="Mobile-first"
          title="Designed for the way you actually check your portfolio"
          sub="Native bottom nav, swipe-friendly cards, instant BUY zone scanning — the full product in your pocket, not a stripped-down mobile view."
        />

        <div className="mt-16 flex items-end justify-center">
          {/* Left phone — hidden on xs, visible sm+ */}
          <div className="hidden -mr-8 -rotate-6 flex-col items-center opacity-85 sm:flex">
            <Image
              src="/screenshots/mobile-filter-expanded.png"
              alt="Filter and sort panel on mobile"
              width={220}
              height={460}
            />
            <p className="mt-3 text-sm text-muted-foreground">Sort &amp; filter on the go</p>
          </div>

          {/* Center phone — always visible, lifted above sides */}
          <div className="relative z-10 mb-6 flex flex-col items-center">
            <Image
              src="/screenshots/mobile-holdings.png"
              alt="Portfolio holdings view on mobile"
              width={260}
              height={544}
              priority
            />
            <p className="mt-3 hidden text-sm text-muted-foreground sm:block">
              Holdings at a glance
            </p>
          </div>

          {/* Right phone — hidden on xs, visible sm+ */}
          <div className="hidden -ml-8 rotate-6 flex-col items-center opacity-85 sm:flex">
            <Image
              src="/screenshots/mobile-watchlist.png"
              alt="Watchlist with BUY zone signals on mobile"
              width={220}
              height={460}
            />
            <p className="mt-3 text-sm text-muted-foreground">BUY zones, instantly</p>
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Layout notes:**
- `flex items-end justify-center` — bottoms of all phones align; center phone is lifted via `mb-6` (1.5 rem above the baseline).
- `-mr-8` / `-ml-8` — side phones overlap center by 2 rem for the layered depth effect.
- `-rotate-6` / `rotate-6` — ±6° tilt on side phones.
- `opacity-85` — side phones are slightly receded.
- `z-10` on center — center phone renders on top of the overlapping edges.
- `priority` on center phone only (it's above the fold on most viewport sizes).

- [ ] **Step 2: Run the type-check to catch import or prop errors**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors, fix the flagged lines before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/components/marketing/mobile-section.tsx
git commit -m "feat(marketing): add MobileSection component with staggered phone strip"
```

---

### Task 3: Wire `MobileSection` into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `MobileSection` from `@/components/marketing/mobile-section` (no props).

- [ ] **Step 1: Add the import**

In `src/app/page.tsx`, add `MobileSection` to the existing import block at the top:

```tsx
// existing imports
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { MobileSection } from "@/components/marketing/mobile-section";  // ← add this line
import { SectionHeading } from "@/components/marketing/section-heading";
```

- [ ] **Step 2: Insert the component between `<FeatureGrid />` and the spreadsheet CTA**

Find this block in `src/app/page.tsx`:

```tsx
        {/* Personas */}
        <PersonasStrip />

        {/* Feature grid */}
        <FeatureGrid />

        {/* Spreadsheet replacement */}
        <section className="border-t">
```

Replace it with:

```tsx
        {/* Personas */}
        <PersonasStrip />

        {/* Feature grid */}
        <FeatureGrid />

        {/* Mobile section */}
        <MobileSection />

        {/* Spreadsheet replacement */}
        <section className="border-t">
```

- [ ] **Step 3: Run type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run the dev server and verify visually**

```bash
npm run dev
```

Open `http://localhost:3000` and scroll to the section between "Everything a value investor needs" and "A modern replacement for your stock-tracking spreadsheet". Verify:

- Three phones visible at desktop width (≥640px): left tilted left, center upright and lifted, right tilted right
- At a narrow viewport (<640px): only the center phone is shown, no captions
- Section heading reads "Designed for the way you actually check your portfolio"
- No layout shift or overflow-x on mobile viewport

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(marketing): add mobile-first section to home page"
```
