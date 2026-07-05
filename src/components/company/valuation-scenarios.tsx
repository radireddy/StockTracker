"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { handleGridKeyDown } from "@/lib/grid-keyboard-nav";
import { fmtNum, fmtIrr, fmtPriceShort } from "@/lib/utils/calculations";
import type { ProjectionStrategy } from "@/lib/projections/types";
import type { FinancialYear } from "@/types/database";

type ScenarioType = "bull" | "base" | "bare";

const SCENARIO_LABELS: Record<ScenarioType, { label: string; color: string }> = {
  bull: { label: "Bull", color: "text-green-700 dark:text-green-400" },
  base: { label: "Base", color: "text-blue-700 dark:text-blue-400" },
  bare: { label: "Bare", color: "text-orange-700 dark:text-orange-400" },
};

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatFieldValue(key: string, val: number | null): string {
  if (val == null || !isFinite(val)) return "";
  if (key === "irr") return fmtIrr(val);
  if (key === "buy_price") return fmtPriceShort(val);
  if (key === "target_market_cap" || key === "buying_market_cap" || key === "expected_ev") {
    return `₹${Math.round(val).toLocaleString("en-IN")}`;
  }
  if (key.includes("ratio") || key === "target_pe") {
    return val.toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }
  return fmtNum(val);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ValuationScenariosProps {
  strategy: ProjectionStrategy;
  scenarioData: Record<ScenarioType, Record<string, number | null>>;
  storedDerivedScenarios?: Record<ScenarioType, Record<string, number | null>>;
  financialYears: FinancialYear[];
  company: {
    market_cap: number | null;
    current_price: number | null;
    expected_returns: number | null;
    investment_horizon_years: number | null;
  };
  expReturns: number;
  onExpReturnsChange: (val: number) => void;
  onScenarioChange: (type: ScenarioType, key: string, value: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ValuationScenarios({
  strategy,
  scenarioData,
  storedDerivedScenarios,
  financialYears,
  company,
  expReturns,
  onExpReturnsChange,
  onScenarioChange,
}: ValuationScenariosProps) {
  const fields = strategy.getValuationFields();

  const terminalYear = useMemo(() => {
    if (financialYears.length === 0) return null;
    return financialYears[financialYears.length - 1];
  }, [financialYears]);

  const terminalMetricLabel = strategy.getTerminalMetricLabel();
  const terminalMetricValue = strategy.getTerminalMetricValue(terminalYear);

  const curMC = company.market_cap ?? 0; // market_cap may be null in new schema
  const horizon = company.investment_horizon_years ?? 2;

  // Build company object with current expReturns for valuation computation
  const companyForCalc = useMemo(() => ({
    ...company,
    expected_returns: expReturns,
  }), [company, expReturns]);

  // Compute derived values for each scenario
  const derivedScenarios = useMemo(() => {
    const result: Record<ScenarioType, Record<string, number | null>> = {
      bull: {}, base: {}, bare: {},
    };
    for (const type of ["bull", "base", "bare"] as const) {
      result[type] = strategy.computeValuationDerived(
        scenarioData[type],
        terminalYear,
        companyForCalc
      );
    }
    return result;
  }, [strategy, scenarioData, terminalYear, companyForCalc]);

  // Compute horizon-level Forward PEG metrics
  const horizonPeg = useMemo(() => {
    if (!strategy.computeHorizonPeg) return null;
    return strategy.computeHorizonPeg(financialYears, company.market_cap);
  }, [strategy, financialYears, company.market_cap]);

  return (
    <div className="space-y-4">
      {/* Top info row */}
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <Label className="text-xs text-muted-foreground">Current Market Cap</Label>
          <div className="text-sm font-semibold tabular-nums">
            {curMC > 0 ? `₹${Math.round(curMC).toLocaleString("en-IN")} Cr` : "-"}
          </div>
        </div>
        <div className="w-40">
          <Label className="text-xs text-muted-foreground">Expected Returns (%)</Label>
          <Input
            type="number"
            step="any"
            className="h-8 text-sm"
            value={expReturns}
            onChange={(e) => onExpReturnsChange(e.target.value === "" ? 25 : Number(e.target.value))}
          />
        </div>
        {terminalMetricValue != null && (
          <div>
            <Label className="text-xs text-muted-foreground">{terminalMetricLabel}</Label>
            <div className="text-sm font-semibold tabular-nums">
              ₹{fmtNum(terminalMetricValue)} Cr
            </div>
          </div>
        )}
        <div>
          <Label className="text-xs text-muted-foreground">Horizon</Label>
          <div className="text-sm font-semibold tabular-nums">
            {horizon} years
          </div>
        </div>
      </div>

      {/* Scenarios table */}
      <div className="rounded-md border border-border/50 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky-col sticky left-0 z-20 w-20"></TableHead>
              {fields.map((f) => (
                <TableHead
                  key={f.key}
                  className={`${f.isInput ? "text-center" : "text-right"} font-bold text-amber-700 dark:text-amber-400`}
                >
                  {f.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {(["bull", "base", "bare"] as const).map((type, scenarioIdx) => {
              const inputs = scenarioData[type];
              const derived = derivedScenarios[type];
              const cfg = SCENARIO_LABELS[type];

              // Merge inputs + derived for display
              const allValues: Record<string, number | null> = { ...derived };
              // Input values take precedence for display in input fields
              for (const f of fields) {
                if (f.isInput) {
                  allValues[f.key] = inputs[f.key] ?? null;
                }
              }

              return (
                <TableRow key={type}>
                  <TableCell className={`sticky-col sticky left-0 z-10 font-semibold ${cfg.color}`}>
                    {cfg.label}
                  </TableCell>
                  {fields.map((f, colIdx) => {
                    if (f.isInput) {
                      return (
                        <TableCell key={f.key} className="p-1 w-32">
                          <Input
                            type="number"
                            step="any"
                            data-row={scenarioIdx}
                            data-col={colIdx}
                            className="h-8 text-right text-sm tabular-nums border-transparent bg-transparent hover:border-input hover:bg-background focus:border-input focus:bg-background transition-colors"
                            placeholder="--"
                            value={inputs[f.key] ?? ""}
                            onChange={(e) => onScenarioChange(type, f.key, e.target.value)}
                            onKeyDown={handleGridKeyDown}
                          />
                        </TableCell>
                      );
                    }

                    const liveVal = derived[f.key] ?? null;
                    const storedVal = storedDerivedScenarios?.[type]?.[f.key] ?? null;
                    const val = liveVal ?? storedVal;
                    const isStale = liveVal == null && storedVal != null;
                    const isBoldField = f.key === "irr" || f.key === "buy_price";

                    return (
                      <TableCell
                        key={f.key}
                        className={`text-right text-sm tabular-nums ${isBoldField ? "font-medium" : ""} ${isStale ? "italic text-muted-foreground" : ""}`}
                      >
                        {formatFieldValue(f.key, val) || ""}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Forward PEG Ratio summary */}
      {horizonPeg && (
        <div className="flex flex-wrap items-end gap-6 rounded-md border border-border/50 px-4 py-3">
          <div>
            <span className="text-xs text-muted-foreground">Trailing PE</span>
            <div className="text-sm font-semibold tabular-nums">
              {horizonPeg.currentPe != null
                ? horizonPeg.currentPe.toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
                : "—"}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Earnings CAGR ({horizon}Y)</span>
            <div className="text-sm font-semibold tabular-nums">
              {horizonPeg.earningsCagr != null ? `${horizonPeg.earningsCagr}%` : "—"}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Forward PEG Ratio</span>
            <div className={`text-sm font-bold tabular-nums ${
              horizonPeg.forwardPeg == null
                ? ""
                : horizonPeg.forwardPeg < 1
                  ? "text-green-700 dark:text-green-400"
                  : horizonPeg.forwardPeg <= 2
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-red-700 dark:text-red-400"
            }`}>
              {horizonPeg.forwardPeg != null
                ? horizonPeg.forwardPeg.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
                : "—"}
            </div>
          </div>
          {horizonPeg.forwardPeg != null && (
            <div className="text-xs text-muted-foreground">
              {horizonPeg.forwardPeg < 1
                ? "Potentially undervalued"
                : horizonPeg.forwardPeg <= 2
                  ? "Fairly valued"
                  : "Potentially overvalued"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
