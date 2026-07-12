import type { Metadata } from "next";
import {
  canonical,
  breadcrumbJsonLd,
  faqJsonLd,
  softwareApplicationJsonLd,
  organizationJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/marketing/json-ld";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { FaqSection } from "@/components/marketing/faq";
import { AllocationCalculator } from "@/components/marketing/allocation-calculator";

const PATH = "/allocation-calculator";
const TITLE = "Stock Allocation Calculator — Size Positions by Conviction";
const DESCRIPTION =
  "Free stock allocation calculator for Indian investors. Enter your total amount, number of stocks per conviction tier, and target weight bands — get exact allocations per bucket instantly. No sign-up needed.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
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
  ],
  alternates: { canonical: PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: canonical(PATH) },
};

const FAQS = [
  {
    q: "How does the stock allocation calculator work?",
    a: "Enter your total investment amount, the number of stocks in each conviction tier (1–4 stars), and optional target weight bands per tier. The calculator shows how much to allocate to each bucket in total and what remains as a cash buffer.",
  },
  {
    q: "What percentage of portfolio should I put in each stock?",
    a: "A common conviction-based approach: 6–8% per 4-star holding, 4–6% per 3-star, 2–4% per 2-star, and 0–2% per 1-star. These are the defaults in this calculator — you can adjust them to match your own style.",
  },
  {
    q: "What is conviction-based position sizing?",
    a: "Instead of equal-weighting every stock, you size positions according to how strongly you believe in each one. Higher-conviction names get a larger target weight; speculative positions stay small. The star-rating system is one way to express that conviction as a number.",
  },
  {
    q: "What is the cash buffer in the results?",
    a: "The cash buffer is the portion of your total investment not assigned to any star bucket. It represents uninvested capital — useful as dry powder for future opportunities or to stay under your total.",
  },
];

function jsonLd(): string[] {
  return [
    breadcrumbJsonLd("Stock Allocation Calculator", PATH),
    faqJsonLd(FAQS),
    softwareApplicationJsonLd(),
    organizationJsonLd(),
  ];
}

export default function AllocationCalculatorPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <JsonLd graphs={jsonLd()} />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary)/8%,transparent)]"
          />
          <div className="mx-auto max-w-2xl px-4 py-16 sm:py-20 text-center">
            <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground dark:bg-primary/10 dark:text-primary">
              Free tool
            </span>
            <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
              Stock allocation calculator
            </h1>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              See how much to put in each conviction bucket before you invest a
              single rupee.
            </p>
            <p className="mx-auto mt-4 max-w-prose text-sm text-muted-foreground">
              This calculator turns your conviction-based star ratings into
              concrete targets. Set how many 4-star, 3-star, 2-star, and 1-star
              stocks you hold, adjust the target weight band for each tier, and
              see exactly how much to deploy per bucket — along with how much
              stays as a cash buffer.
            </p>
          </div>
        </section>

        {/* Calculator */}
        <section className="border-t">
          <div className="mx-auto max-w-2xl px-4 py-12">
            <AllocationCalculator />
          </div>
        </section>

        {/* FAQ */}
        <FaqSection faqs={FAQS} />
      </main>

      <SiteFooter />
    </div>
  );
}
