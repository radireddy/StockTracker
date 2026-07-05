import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";
import { GoogleCta } from "@/components/marketing/google-cta";

const LINKS = [
  { href: "/zerodha-portfolio-tracker", label: "Zerodha portfolio tracker" },
  {
    href: "/intrinsic-value-margin-of-safety",
    label: "Intrinsic value & margin of safety",
  },
  { href: "/portfolio-allocation", label: "Portfolio allocation" },
  { href: "/watchlist-buy-signal", label: "Watchlist buy signal" },
  {
    href: "/quarterly-earnings-timeline",
    label: "Quarterly earnings timeline",
  },
  { href: "/stock-research-organizer", label: "Stock research organizer" },
  { href: "/stock-valuation-model", label: "Stock valuation model" },
  {
    href: "/family-portfolio-multiple-demat",
    label: "Family portfolio & multiple demat",
  },
  {
    href: "/stock-portfolio-excel-alternative",
    label: "Stock portfolio — Excel alternative",
  },
  { href: "/living-research-report", label: "Living research report" },
];

/** Shared marketing footer with internal SEO links to the product pages. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="/" className="text-lg font-bold text-primary">
              {SITE_NAME}
            </Link>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              {SITE_TAGLINE}.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm" aria-label="Product pages">
            <span className="font-semibold text-foreground">Explore</span>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-8 flex items-center justify-between border-t pt-6 text-sm text-muted-foreground">
          <span>{SITE_TAGLINE}</span>
          <GoogleCta className="hover:text-foreground">Sign in</GoogleCta>
        </div>
      </div>
    </footer>
  );
}
