import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { withAxiom } from "next-axiom";

export const proxy = withAxiom(async function proxy(request: NextRequest) {
  return await updateSession(request);
});

export const config = {
  matcher: [
    // Skip Next internals, static assets, and the public SEO/metadata routes
    // (robots, sitemap, manifest, OG/Twitter images, icons) so crawlers and
    // social scrapers reach them without hitting the auth redirect.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|opengraph-image|twitter-image|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
