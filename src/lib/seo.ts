/**
 * Central SEO constants shared by the root metadata, robots, sitemap, and the
 * marketing landing page. Keep the canonical host in one place so the sitemap,
 * canonical tags, and structured data never drift apart.
 */

/** Canonical production origin. The apex domain should 301 to this host. */
export const SITE_URL = "https://www.stocktracks.in";

export const SITE_NAME = "StockTracker";

export const SITE_TAGLINE =
  "Stock portfolio tracker & research tool for Indian investors";

export const SITE_DESCRIPTION =
  "StockTracker is a stock portfolio tracker for Indian investors. Import your Zerodha holdings in one click, build financial models with intrinsic value and margin of safety, track your investment thesis, and monitor P&L — a modern replacement for your stock-tracking spreadsheet.";

export const SITE_KEYWORDS = [
  "stock portfolio tracker",
  "stock portfolio tracker India",
  "Zerodha holdings tracker",
  "import Zerodha holdings",
  "intrinsic value calculator",
  "margin of safety",
  "stock valuation tool",
  "investment thesis tracker",
  "track investments",
  "portfolio management app",
  "stock tracking spreadsheet alternative",
  "value investing tool",
  "portfolio allocation tool",
  "conviction based position sizing",
  "bull base bear valuation",
  "quarterly stock tracking",
  "multi account demat tracker",
];

/** True only on the production Vercel deployment (drives robots indexability). */
export const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

/** Absolute canonical URL for a route path (e.g. "/portfolio-allocation"). */
export function canonical(path: string): string {
  return path === "/" ? SITE_URL : `${SITE_URL}${path}`;
}

/**
 * BreadcrumbList JSON-LD for a sub-page: Home › <label>. Serialized and
 * "<"-escaped so it can never break out of the inline <script>.
 */
export function breadcrumbJsonLd(label: string, path: string): string {
  const graph = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
      { "@type": "ListItem", position: 2, name: label, item: canonical(path) },
    ],
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

/** FAQPage JSON-LD from a list of Q/A pairs, "<"-escaped for inline <script>. */
export function faqJsonLd(faqs: { q: string; a: string }[]): string {
  const graph = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}
