import type { Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

/**
 * Preferred portfolio to open for a given type: the default one if present,
 * otherwise the first of that type, else null. Used by the desktop portfolio
 * nav and the mobile bottom nav to pick a portfolio when switching type.
 */
export function firstOfType(
  portfolios: PortfolioWithCount[],
  type: Portfolio["type"]
): PortfolioWithCount | null {
  const ofType = portfolios.filter((p) => p.type === type);
  return ofType.find((p) => p.is_default) ?? ofType[0] ?? null;
}

/**
 * Two-letter initials for a company/portfolio name, used for the avatar tiles
 * in tables and cards. Strips non-letters, takes the first letter of the first
 * two words (falling back to the first two letters of a single word).
 */
export function initials(name: string): string {
  const words = name
    .replace(/[^A-Za-z ]/g, "")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
