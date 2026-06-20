import type { ProjectionType } from "@/types/database";
import type { ProjectionStrategy } from "./types";
import { PeEarningsStrategy } from "./pe-earnings-strategy";
import { EvEbitdaStrategy } from "./ev-ebitda-strategy";

const strategies: Record<ProjectionType, ProjectionStrategy> = {
  pe_earnings: new PeEarningsStrategy(),
  ev_ebitda: new EvEbitdaStrategy(),
};

export function getStrategy(type: ProjectionType): ProjectionStrategy {
  const strategy = strategies[type];
  if (!strategy) throw new Error(`Unknown projection type: ${type}`);
  return strategy;
}

export function getAvailableTypes(): { type: ProjectionType; label: string }[] {
  return Object.values(strategies).map((s) => ({ type: s.type, label: s.label }));
}

export function getAvailableTypesExcluding(
  existingTypes: ProjectionType[]
): { type: ProjectionType; label: string }[] {
  const existing = new Set(existingTypes);
  return getAvailableTypes().filter((t) => !existing.has(t.type));
}
