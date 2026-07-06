import type { Metadata } from "next";
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
} from "@/lib/seo";
import { GoogleCta } from "@/components/marketing/google-cta";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { JsonLd } from "@/components/marketing/json-ld";
import { HeroCarousel } from "@/components/marketing/hero-carousel";
import { PersonasStrip } from "@/components/marketing/personas-strip";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { MobileSection } from "@/components/marketing/mobile-section";
import { SectionHeading } from "@/components/marketing/section-heading";
import { FaqSection, HOME_FAQS } from "@/components/marketing/faq";
import { AllocationDemo } from "@/components/marketing/demos/allocation-demo";
import { LiveValuationDemo } from "@/components/marketing/demos/live-valuation-demo";
import { TimelineDemo } from "@/components/marketing/demos/timeline-demo";

export const metadata: Metadata = {
  title: SITE_TAGLINE,
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
  },
};

const DEEP_DIVES = [
  {
    eyebrow: "Live, never stale",
    title: "Valuations that recompute with the price",
    body: "Set your bull, base and bare assumptions once. Margin of safety, IRR and your buy signal update against the live price — the discipline of a research desk, always current.",
    Demo: LiveValuationDemo,
  },
  {
    eyebrow: "Where the next rupee goes",
    title: "Allocation anchored to your conviction",
    body: "Star ratings become target weight bands. Every under- and over-weight position is flagged with the exact rupees to add or trim — so incremental capital follows conviction, not emotion.",
    Demo: AllocationDemo,
  },
  {
    eyebrow: "Compounding memory",
    title: "A living timeline for every company",
    body: "Log each quarter's result, guidance and concall notes with images, PDFs and links. Years of tracking, scrollable in minutes when it's time to add or trim.",
    Demo: TimelineDemo,
  },
];

function jsonLd(): string {
  const graph = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: HOME_FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];
  // Escape "<" so a stray sequence can never break out of the script element.
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

export default async function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <JsonLd graphs={[jsonLd()]} />
      <SiteHeader home />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary)/8%,transparent)]"
          />
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <HeroCarousel />
          </div>
        </section>

        {/* Deep-dive demos */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-6xl space-y-20 px-4 py-20">
            <SectionHeading
              title="See it work — not just read about it"
              sub="Three of the moments StockTracker was built for. Everything below is the real product surface."
            />
            {DEEP_DIVES.map((d, idx) => {
              const Demo = d.Demo;
              const flip = idx % 2 === 1;
              return (
                <div
                  key={d.title}
                  className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12"
                >
                  <div className={flip ? "lg:order-2" : ""}>
                    <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                      {d.eyebrow}
                    </span>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                      {d.title}
                    </h3>
                    <p className="mt-4 max-w-lg text-muted-foreground">{d.body}</p>
                  </div>
                  <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
                    <Demo />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Personas */}
        <PersonasStrip />

        {/* Feature grid */}
        <FeatureGrid />

        {/* Mobile section */}
        <MobileSection />

        {/* Spreadsheet replacement */}
        <section className="border-t">
          <div className="mx-auto max-w-3xl px-4 py-20 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground">
              A modern replacement for your stock-tracking spreadsheet
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-muted-foreground">
              StockTracker grew out of a real Excel investing model. It keeps the
              rigor — multi-year models, valuation scenarios, margin of safety —
              but removes the broken formulas, version chaos and manual data
              entry. Sign in and bring your whole process online.
            </p>
            <div className="mt-10">
              <GoogleCta className="inline-block rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
                Get started free
              </GoogleCta>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <FaqSection faqs={HOME_FAQS} />
      </main>

      <SiteFooter />
    </div>
  );
}
