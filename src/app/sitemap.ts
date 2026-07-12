import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    "/allocation-calculator",
    "/zerodha-portfolio-tracker",
    "/intrinsic-value-margin-of-safety",
    "/portfolio-allocation",
    "/watchlist-buy-signal",
    "/quarterly-earnings-timeline",
    "/stock-research-organizer",
    "/stock-valuation-model",
    "/family-portfolio-multiple-demat",
    "/stock-portfolio-excel-alternative",
    "/living-research-report",
  ];
  return [
    {
      url: SITE_URL,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...pages.map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
