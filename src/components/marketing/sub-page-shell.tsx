import Link from "next/link";
import type { ReactNode } from "react";
import { GoogleCta } from "@/components/marketing/google-cta";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { JsonLd } from "@/components/marketing/json-ld";
import { FaqSection, type Faq } from "@/components/marketing/faq";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from "@/lib/seo";

/** Other product pages to cross-link, minus the current one. */
const ALL = [
  { href: "/zerodha-portfolio-tracker", label: "Zerodha portfolio tracker" },
  {
    href: "/intrinsic-value-margin-of-safety",
    label: "Intrinsic value & margin of safety",
  },
  { href: "/portfolio-allocation", label: "Portfolio allocation" },
];

/**
 * Shared layout for the focused SEO landing pages: a keyword-targeted hero with
 * one live demo, the page's own sections, a cross-link strip, a trimmed FAQ,
 * and BreadcrumbList + FAQPage structured data.
 */
export function SubPageShell({
  path,
  breadcrumbLabel,
  eyebrow,
  h1,
  sub,
  demo,
  faqs,
  children,
}: {
  path: string;
  breadcrumbLabel: string;
  eyebrow: string;
  h1: string;
  sub: string;
  demo: ReactNode;
  faqs: Faq[];
  children?: ReactNode;
}) {
  const others = ALL.filter((l) => l.href !== path);
  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-background text-foreground">
      <JsonLd
        graphs={[
          breadcrumbJsonLd(breadcrumbLabel, path),
          faqJsonLd(faqs),
          softwareApplicationJsonLd(),
          organizationJsonLd(),
        ]}
      />
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary)/8%,transparent)]"
          />
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
              <div className="min-w-0">
                <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  {eyebrow}
                </span>
                <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                  {h1}
                </h1>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {sub}
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <GoogleCta className="w-full rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto">
                    Continue with Google
                  </GoogleCta>
                </div>
              </div>
              <div className="min-w-0">{demo}</div>
            </div>
          </div>
        </section>

        {children}

        {/* Cross-links */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-primary">
              Explore more
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {others.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="rounded-xl border border-border bg-background p-5 text-center font-medium text-foreground transition-colors hover:border-primary/40"
                >
                  {l.label}
                </Link>
              ))}
              <Link
                href="/"
                className="rounded-xl border border-border bg-background p-5 text-center font-medium text-foreground transition-colors hover:border-primary/40 sm:col-span-3"
              >
                See everything StockTracker does →
              </Link>
            </div>
          </div>
        </section>

        <FaqSection faqs={faqs} />
      </main>

      <SiteFooter />
    </div>
  );
}
