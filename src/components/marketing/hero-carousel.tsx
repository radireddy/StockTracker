"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GoogleCta } from "@/components/marketing/google-cta";
import { usePrefersReducedMotion } from "@/hooks/use-in-view";
import { LiveValuationDemo } from "./demos/live-valuation-demo";
import { AllocationDemo } from "./demos/allocation-demo";
import { UnifiedCompanyDemo } from "./demos/unified-company-demo";
import { DashboardScanDemo } from "./demos/dashboard-scan-demo";
import { TimelineDemo } from "./demos/timeline-demo";
import { ZerodhaImportDemo } from "./demos/zerodha-import-demo";

/**
 * Auto-rotating hero. Each slide pairs a persona's pain with a live faux-UI
 * demo. Slide 1's headline is the page <h1>; the rest are visually identical
 * <p> so the page keeps a single h1. Pauses on hover/focus; honours
 * prefers-reduced-motion (no auto-advance).
 */
type Slide = {
  eyebrow: string;
  headline: string;
  sub: string;
  Demo: () => React.JSX.Element;
  secondaryLink?: { label: string; href: string };
};

const SLIDES: Slide[] = [
  {
    eyebrow: "For the research advisory subscriber",
    headline: "Your RA's buy call landed at 420. The stock opened at 441.",
    sub: "The target in that PDF was computed at a price that no longer exists. You're doing mental math — does the MoS still hold? Am I already over-allocated? StockTracker recomputes buy price, margin of safety and IRR against the live price the moment you open it. When markets fall and noise spikes, you open one screen: which names are below your buy price, which are under-allocated, the exact rupees to deploy. The data decides — not the panic.",
    Demo: LiveValuationDemo,
    secondaryLink: {
      label: "Using an RA service? See how StockTracker was built for you →",
      href: "/research-advisory-portfolio-tracker",
    },
  },
  {
    eyebrow: "For the capital deployer",
    headline: "You have ₹5L to invest. Which stock? How much?",
    sub: "Conviction-weighted target bands per star rating show exactly which holdings are under-allocated — and the rupee amount that brings each back into range.",
    Demo: AllocationDemo,
  },
  {
    eyebrow: "For the concentrated investor",
    headline: "Thesis in Notes. Model in Excel. Target in a PDF.",
    sub: "Your entire research file for one company — thesis, multi-year model, valuation and position — lives on a single page instead of scattered across five apps.",
    Demo: UnifiedCompanyDemo,
  },
  {
    eyebrow: "For the watchlist hunter",
    headline: "Is it still a buy after today's move?",
    sub: "Set your target from your own model and let the dashboard watch the price. The moment a name crosses into buying range, it flags a BUY — no daily price-checking.",
    Demo: DashboardScanDemo,
  },
  {
    eyebrow: "For the quarterly tracker",
    headline: "31 companies. Every quarter. Where did I write that down?",
    sub: "A dated timeline per company — concall notes, guidance, charts, PDFs and links — turns quarterly tracking into compounding memory you can scroll in minutes.",
    Demo: TimelineDemo,
  },
  {
    eyebrow: "For the multi-account household",
    headline: "Same stock, three demat accounts. What do you actually own?",
    sub: "Import each Zerodha statement in one click. StockTracker consolidates every account into a true total position — and still lets you drill into any single one.",
    Demo: ZerodhaImportDemo,
  },
];

const INTERVAL = 6000;

export function HeroCarousel() {
  const reduced = usePrefersReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const go = useCallback((n: number) => setI((n + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    if (reduced || paused) return;
    const id = setInterval(() => setI((p) => (p + 1) % SLIDES.length), INTERVAL);
    return () => clearInterval(id);
  }, [reduced, paused]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        touchX.current = null;
      }}
      aria-roledescription="carousel"
      aria-label="What StockTracker solves"
    >
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        {/* Text column */}
        <div className="min-w-0">
          {/* All slides share one grid cell, so the column height is always the
              tallest slide's — it never changes when the active slide switches,
              which keeps the CTA and dots below from shifting under the cursor. */}
          <div className="grid">
            {SLIDES.map((s, idx) => {
              const active = idx === i;
              const Tag = idx === 0 ? "h1" : "p";
              return (
                <div
                  key={idx}
                  aria-hidden={!active}
                  className={[
                    "col-start-1 row-start-1 transition-opacity duration-700 motion-reduce:transition-none",
                    active ? "opacity-100" : "pointer-events-none opacity-0",
                  ].join(" ")}
                >
                  <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground dark:bg-primary/10 dark:text-primary">
                    {s.eyebrow}
                  </span>
                  <Tag className="mt-5 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                    {s.headline}
                  </Tag>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                    {s.sub}
                  </p>
                  {s.secondaryLink && (
                    <Link
                      href={s.secondaryLink.href}
                      className="mt-4 block text-sm font-medium text-primary hover:underline"
                    >
                      {s.secondaryLink.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <GoogleCta className="w-full rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto">
              Continue with Google
            </GoogleCta>
          </div>

          {/* Dots */}
          <div className="mt-8 flex gap-2" role="tablist" aria-label="Choose a scenario">
            {SLIDES.map((s, idx) => (
              <button
                key={idx}
                type="button"
                role="tab"
                aria-selected={idx === i}
                aria-label={s.eyebrow}
                onClick={() => go(idx)}
                className={[
                  "h-2 rounded-full transition-all",
                  idx === i ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                ].join(" ")}
              />
            ))}
          </div>
        </div>

        {/* Demo column — same grid-stack so its height stays constant too, and
            items-center on the outer grid doesn't re-center the text column. */}
        <div className="min-w-0">
          <div className="grid">
            {SLIDES.map((s, idx) => {
              const active = idx === i;
              const Demo = s.Demo;
              return (
                <div
                  key={idx}
                  aria-hidden={!active}
                  className={[
                    "col-start-1 row-start-1 transition-opacity duration-700 motion-reduce:transition-none",
                    active ? "opacity-100" : "pointer-events-none opacity-0 max-lg:hidden",
                  ].join(" ")}
                >
                  <Demo />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
