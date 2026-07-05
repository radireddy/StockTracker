import type { MetadataRoute } from "next";
import { SITE_URL, IS_PRODUCTION } from "@/lib/seo";

/** Private, login-gated routes that no crawler (search or AI) should index. */
const DISALLOW = [
  "/dashboard",
  "/company",
  "/import",
  "/settings",
  "/api/",
  "/auth/",
  "/login",
];

/**
 * AI/LLM crawlers we explicitly welcome. Naming each one removes any ambiguity
 * about whether a bot may crawl us — a few (e.g. Google-Extended, Applebot-
 * Extended) default to NOT crawling unless a matching rule opts them in.
 * Covers both training crawlers (GPTBot, ClaudeBot, Google-Extended) and
 * live-search/citation bots (OAI-SearchBot, PerplexityBot, etc.).
 */
const AI_BOTS = [
  "GPTBot", // OpenAI training crawler
  "OAI-SearchBot", // ChatGPT Search
  "ChatGPT-User", // ChatGPT live browsing on user request
  "ClaudeBot", // Anthropic training crawler
  "Claude-Web", // Anthropic live browsing
  "anthropic-ai", // Anthropic (legacy UA)
  "PerplexityBot", // Perplexity index
  "Perplexity-User", // Perplexity live fetch on user request
  "Google-Extended", // Gemini / Google AI training
  "Applebot-Extended", // Apple Intelligence
  "Amazonbot", // Amazon (Alexa/Rufus)
  "CCBot", // Common Crawl (feeds many models)
  "cohere-ai", // Cohere
  "Bytespider", // ByteDance / Doubao
  "Meta-ExternalAgent", // Meta AI
  "DuckAssistBot", // DuckDuckGo AI
];

export default function robots(): MetadataRoute.Robots {
  // Never let preview / non-production deployments get indexed.
  if (!IS_PRODUCTION) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      // Default: all conventional search crawlers may index public routes.
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      // Every AI crawler gets the same access as search engines: public pages
      // yes, private/auth routes no.
      { userAgent: AI_BOTS, allow: "/", disallow: DISALLOW },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
