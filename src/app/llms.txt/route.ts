import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  IS_PRODUCTION,
} from "@/lib/seo";

/**
 * /llms.txt — a curated, markdown map of our best public content for LLMs and
 * AI search engines (the emerging convention analogous to robots.txt/sitemap).
 * Kept as a route so it never drifts from the central SEO constants.
 */
export const dynamic = "force-static";

const body = `# ${SITE_NAME}

> ${SITE_TAGLINE}

${SITE_DESCRIPTION}

${SITE_NAME} is a web app for Indian equity investors who currently track their
portfolio in a spreadsheet. It imports Zerodha (and other broker) holdings
statements in one click, then lets you build per-company financial models —
intrinsic value, margin of safety, bull/base/bear valuation scenarios — and
track your investment thesis and P&L across multiple demat accounts.

## Key pages

- [Zerodha portfolio tracker](${SITE_URL}/zerodha-portfolio-tracker): Import Zerodha holdings in one click and track P&L across accounts.
- [Intrinsic value & margin of safety](${SITE_URL}/intrinsic-value-margin-of-safety): Build financial models with intrinsic value and margin of safety for Indian stocks.
- [Portfolio allocation](${SITE_URL}/portfolio-allocation): Conviction-based position sizing and portfolio allocation.

## Facts

- Category: Stock portfolio tracker and equity research tool
- Audience: Indian retail investors, value investors
- Broker import: Zerodha holdings statements (one-click); manual entry supported
- Core features: holdings import, intrinsic value / margin of safety modeling, bull-base-bear valuation scenarios, investment thesis tracking, multi-account consolidation, P&L monitoring
- Positioning: a modern replacement for a stock-tracking spreadsheet
- Pricing: free tier
- Website: ${SITE_URL}
`;

export function GET(): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Don't advertise content on preview/non-prod deployments.
      "X-Robots-Tag": IS_PRODUCTION ? "all" : "noindex",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
