import type { FinancialYear, ProjectionType } from "@/types/database";

export type FieldFormat = "number" | "percent" | "ratio";
export type FieldType = "required" | "input" | "auto";

export interface RowConfig {
  key: string;
  label: string;
  type: FieldType;
  format: FieldFormat;
  section?: "header" | "subtotal" | "total";
  dividerAbove?: boolean;
  locked?: boolean;
  overridable?: boolean;
}

export interface ValuationFieldConfig {
  key: string;
  label: string;
  isInput: boolean;
}

export interface ProjectionStrategy {
  type: ProjectionType;
  label: string;
  rowConfigs: RowConfig[];
  computeFields(years: FinancialYear[], overrides: Set<string>, marketCap?: number | null): FinancialYear[];
  getValuationFields(): ValuationFieldConfig[];
  computeValuationDerived(
    scenarioInputs: Record<string, number | null>,
    terminalYear: FinancialYear | null,
    company: { market_cap: number | null; current_price: number | null; expected_returns: number | null; investment_horizon_years: number | null }
  ): Record<string, number | null>;
  getTerminalMetricLabel(): string;
  getTerminalMetricValue(terminalYear: FinancialYear | null): number | null;
}
