import type { MetadataRoute } from "next";
import { SITE_URL, IS_PRODUCTION } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Never let preview / non-production deployments get indexed.
  if (!IS_PRODUCTION) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard",
          "/company",
          "/import",
          "/settings",
          "/api/",
          "/auth/",
          "/login",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
