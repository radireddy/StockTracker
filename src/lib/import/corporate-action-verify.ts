import type { CorporateActionCandidate } from "./corporate-action-detect";
import type { RefAction } from "./corporate-actions-data";

export function verifyCandidate(
  candidate: CorporateActionCandidate,
  refBySymbol: Map<string, RefAction[]>
): { status: "verified" | "inferred" | "unexplained"; ex_date?: string } {
  if (candidate.status === "unexplained") return { status: "unexplained" };
  const refs = refBySymbol.get(candidate.symbol) ?? [];
  for (const r of refs) {
    const inWindow = r.ex_date >= candidate.ex_date_window.from && r.ex_date <= candidate.ex_date_window.to;
    const factorMatch = Math.abs(r.factor - candidate.factor) / candidate.factor <= 0.02;
    if (inWindow && factorMatch) return { status: "verified", ex_date: r.ex_date };
  }
  return { status: "inferred" };
}
