# Mobile Section — Landing Page

**Date:** 2026-07-05
**Status:** Approved

## Goal

Add a "designed for mobile" section to the home page that uses real product screenshots in phone frames to show visitors that StockTracker is a first-class mobile experience, not a responsive afterthought.

## Placement

Insert the new section between `<FeatureGrid />` and the "Spreadsheet replacement" CTA section in `src/app/page.tsx`. This position gives visual relief after the text-heavy feature grid and builds momentum into the final CTA.

## Copy

**Title:** "Designed for the way you actually check your portfolio"

**Subtitle:** "Native bottom nav, swipe-friendly cards, instant BUY zone scanning — the full product in your pocket, not a stripped-down mobile view."

**Per-phone captions (below each phone):**
- Left phone: "Sort & filter on the go"
- Center phone: "Holdings at a glance"
- Right phone: "BUY zones, instantly"

## Images

Three existing screenshots from `docs/mockups/screenshots/` are copied to `public/screenshots/` and served via Next.js `<Image>`:

| Position | File | Caption |
|----------|------|---------|
| Left | `mobile-filter-expanded.png` | Sort & filter on the go |
| Center | `mobile-holdings.png` | Holdings at a glance |
| Right | `mobile-watchlist.png` | BUY zones, instantly |

The screenshots already include a phone bezel — no CSS frame required.

## Layout: Phone Strip

Three phones in a horizontal row with a depth/arc treatment:

```
      [filter sheet]          [holdings]          [watchlist]
      rotated -6°             upright              rotated +6°
      scale 90%              scale 100%            scale 90%
      opacity 85%            full opacity          opacity 85%
   "Sort & filter            "Holdings at a        "BUY zones,
    on the go"               glance"               instantly"
```

- Center phone has `margin-top: -24px` relative to the row baseline, creating an arc/lift.
- Left and right phones overlap the center slightly via negative horizontal margins (~`-2rem` each side), giving depth.
- Shadow: center phone has a stronger drop shadow (`shadow-2xl`) vs. outer phones (`shadow-lg`).
- Captions sit below each phone, centered, `text-sm text-muted-foreground`.

## Responsive Behaviour

| Breakpoint | Phones shown | Stagger |
|------------|-------------|---------|
| `lg+` | All 3 | Full stagger + arc |
| `sm–md` | Center + right only | Mild tilt on right |
| `< sm` | Center only | Upright, full width |

On `< sm` the caption row is hidden (a single phone needs no caption to differentiate).

## Component

**New file:** `src/components/marketing/mobile-section.tsx`

- Self-contained `<section>` — no props needed.
- Uses `next/image` with `priority={false}`, explicit `width`/`height` matching image aspect ratio.
- Uses `SectionHeading` for the title/sub, consistent with other sections.
- Background: `border-t` with default `bg-background` — FeatureGrid is already `bg-card`, so this alternates correctly.

**Import in `page.tsx`:**
```tsx
import { MobileSection } from "@/components/marketing/mobile-section";
// ...
<FeatureGrid />
<MobileSection />   {/* ← new */}
{/* Spreadsheet replacement section */}
```

## Out of Scope

- No animation or parallax on the phones.
- No dark-mode variants of the screenshots (use the existing light-mode shots; they already show the dark toggle).
- No new routes or data fetching.
