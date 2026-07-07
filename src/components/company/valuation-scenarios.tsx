"use client";

import { useMemo } from "react";
import { handleGridKeyDown } from "@/lib/grid-keyboard-nav";
import { fmtNum, fmtIrr, fmtPriceShort } from "@/lib/utils/calculations";
import type { ProjectionStrategy } from "@/lib/projections/types";
import type { FinancialYear } from "@/types/database";

type ScenarioType = "bull" | "base" | "bare";

// ─── Icons ───────────────────────────────────────────────────────────────────

function BullIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" stroke="none" width="14" height="14" aria-hidden>
      <path d="M5.5 9.5 C5 7, 3 4, 4.5 2 C5.2 1, 6.5 1.5, 7 3.5 L7.5 6.5 Z" opacity={0.9} />
      <path d="M14.5 9.5 C15 7, 17 4, 15.5 2 C14.8 1, 13.5 1.5, 13 3.5 L12.5 6.5 Z" opacity={0.9} />
      <ellipse cx="10" cy="13" rx="7" ry="5.5" />
      <ellipse cx="10" cy="16.2" rx="3.5" ry="2" opacity={0.35} />
      <circle cx="8.3" cy="16.2" r="1.1" />
      <circle cx="11.7" cy="16.2" r="1.1" />
    </svg>
  );
}

function BaseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden>
      <line x1="10" y1="2" x2="10" y2="18" />
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="6" x2="3" y2="9" />
      <path d="M1 9 Q3 12.5 5 9" />
      <line x1="17" y1="6" x2="17" y2="9" />
      <path d="M15 9 Q17 12.5 19 9" />
      <line x1="7" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function BearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" stroke="none" width="14" height="14" aria-hidden>
      <circle cx="5" cy="5.5" r="3.2" />
      <circle cx="15" cy="5.5" r="3.2" />
      <circle cx="10" cy="12.5" r="7" />
      <ellipse cx="10" cy="15.5" rx="3.5" ry="2.2" opacity={0.3} />
      <ellipse cx="10" cy="14.3" rx="2.2" ry="1.4" opacity={0.9} />
      <circle cx="7.2" cy="11.5" r="1" fill="white" />
      <circle cx="12.8" cy="11.5" r="1" fill="white" />
    </svg>
  );
}

// ─── Scenario config ──────────────────────────────────────────────────────────

const SCENARIO_CFG = {
  bull: {
    label: "Bull",
    Icon: BullIcon,
    stripeCls: "bg-positive",
    iconBgCls: "bg-positive/15 text-positive",
    labelCls: "text-positive",
    irrCls: "text-positive",
  },
  base: {
    label: "Base",
    Icon: BaseIcon,
    stripeCls: "bg-blue-500 dark:bg-blue-400",
    iconBgCls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    labelCls: "text-blue-600 dark:text-blue-400",
    irrCls: "text-blue-600 dark:text-blue-400",
  },
  bare: {
    label: "Bear",
    Icon: BearIcon,
    stripeCls: "bg-destructive",
    iconBgCls: "bg-destructive/10 text-destructive",
    labelCls: "text-destructive",
    irrCls: "text-destructive",
  },
} as const;

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtField(key: string, val: number | null): string {
  if (val == null || !isFinite(val)) return "";
  if (key === "irr") return fmtIrr(val);
  if (key === "buy_price") return fmtPriceShort(val);
  if (key === "target_market_cap" || key === "buying_market_cap" || key === "expected_ev") {
    return `₹${Math.round(val).toLocaleString("en-IN")} Cr`;
  }
  if (key === "net_debt_terminal") return `₹${fmtNum(val)} Cr`;
  if (key.includes("ratio") || key === "target_pe" || key === "target_ev_ebitda_ratio") {
    return val.toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  }
  return fmtNum(val);
}

// ─── Props ────────────────────────────────────────────────────────────────────

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
  onScenarioChange,
}: ValuationScenariosProps) {
  const fields = strategy.getValuationFields();
  const inputFields = fields.filter((f) => f.isInput);
  const outputFields = fields.filter((f) => !f.isInput);

  const terminalYear = useMemo(() => {
    if (financialYears.length === 0) return null;
    return financialYears[financialYears.length - 1];
  }, [financialYears]);

  const companyForCalc = useMemo(() => ({
    ...company,
    expected_returns: expReturns,
  }), [company, expReturns]);

  const derivedScenarios = useMemo(() => {
    const result: Record<ScenarioType, Record<string, number | null>> = { bull: {}, base: {}, bare: {} };
    for (const type of ["bull", "base", "bare"] as const) {
      result[type] = strategy.computeValuationDerived(scenarioData[type], terminalYear, companyForCalc);
    }
    return result;
  }, [strategy, scenarioData, terminalYear, companyForCalc]);

  const horizonPeg = useMemo(() => {
    if (!strategy.computeHorizonPeg) return null;
    return strategy.computeHorizonPeg(financialYears, company.market_cap);
  }, [strategy, financialYears, company.market_cap]);

  const horizon = company.investment_horizon_years ?? 2;

  return (
    <div className="space-y-4">
      {/* ── Scenario table ──────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky top-0 z-10 bg-muted/40 py-2.5 pl-2.5 pr-3 text-left text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground min-w-[140px]">
                  Scenario
                </th>
                {inputFields.map((f) => (
                  <th key={f.key} className="sticky top-0 z-10 bg-muted/40 py-2.5 px-2.5 text-center text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                {outputFields.map((f) => (
                  <th key={f.key} className="sticky top-0 z-10 bg-muted/40 py-2.5 px-2.5 text-right text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["bull", "base", "bare"] as const).map((type, rowIdx) => {
                const cfg = SCENARIO_CFG[type];
                const inputs = scenarioData[type];
                const derived = derivedScenarios[type];
                const stored = storedDerivedScenarios?.[type] ?? {};

                return (
                  <tr key={type} className="border-b border-border/50 last:border-0 transition-colors hover:bg-muted/40">
                    <td className="py-2 pl-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-[3px] self-stretch rounded-full shrink-0 ${cfg.stripeCls}`} aria-hidden="true" />
                        <span className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${cfg.iconBgCls}`}>
                          <cfg.Icon />
                        </span>
                        <span className={`text-sm font-semibold ${cfg.labelCls}`}>{cfg.label}</span>
                      </div>
                    </td>

                    {inputFields.map((f, colIdx) => (
                      <td key={f.key} className="py-2 px-2.5 text-center">
                        <input
                          type="number"
                          step="any"
                          data-row={rowIdx}
                          data-col={colIdx}
                          className="w-20 h-8 text-right text-sm tabular-nums rounded-md border border-border bg-background px-2 outline-none transition-all hover:border-border/80 focus:border-primary focus:ring-1 focus:ring-primary/30"
                          placeholder="—"
                          value={inputs[f.key] ?? ""}
                          onChange={(e) => onScenarioChange(type, f.key, e.target.value)}
                          onKeyDown={handleGridKeyDown}
                        />
                      </td>
                    ))}

                    {outputFields.map((f) => {
                      const live = derived[f.key] ?? null;
                      const stale = stored[f.key] ?? null;
                      const val = live ?? stale;
                      const isStale = live == null && stale != null;
                      const isIrr = f.key === "irr";
                      const isBuyPrice = f.key === "buy_price";

                      return (
                        <td key={f.key} className="py-2 px-2.5 text-right">
                          {val != null ? (
                            <span className={[
                              "tabular-nums",
                              isStale ? "italic text-muted-foreground" : "",
                              isIrr ? `text-base font-extrabold ${cfg.irrCls}` : "",
                              isBuyPrice ? "text-sm font-semibold" : "",
                              !isIrr && !isBuyPrice ? "text-sm font-mono text-muted-foreground" : "",
                            ].filter(Boolean).join(" ")}>
                              {fmtField(f.key, val)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PEG strip ───────────────────────────────────────────────── */}
      {horizonPeg && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <div className="px-4 py-2 bg-muted/40 border-b border-border">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">PEG Analysis</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Trailing PE</p>
              <p className="text-sm font-semibold tabular-nums mt-0.5">
                {horizonPeg.currentPe != null
                  ? horizonPeg.currentPe.toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
                  : "—"}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Earnings CAGR ({horizon}Y)</p>
              <p className="text-sm font-semibold tabular-nums mt-0.5">
                {horizonPeg.earningsCagr != null ? `${horizonPeg.earningsCagr}%` : "—"}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Forward PEG</p>
              <p className={`text-sm font-bold tabular-nums mt-0.5 ${
                horizonPeg.forwardPeg == null ? "" :
                horizonPeg.forwardPeg < 1 ? "text-positive" :
                horizonPeg.forwardPeg <= 2 ? "text-amber-600 dark:text-amber-400" :
                "text-destructive"
              }`}>
                {horizonPeg.forwardPeg != null
                  ? horizonPeg.forwardPeg.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
                  : "—"}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Assessment</p>
              <p className={`text-sm font-semibold mt-0.5 ${
                horizonPeg.forwardPeg == null ? "text-muted-foreground" :
                horizonPeg.forwardPeg < 1 ? "text-positive" :
                horizonPeg.forwardPeg <= 2 ? "text-amber-600 dark:text-amber-400" :
                "text-destructive"
              }`}>
                {horizonPeg.forwardPeg == null ? "—"
                  : horizonPeg.forwardPeg < 1 ? "Undervalued"
                  : horizonPeg.forwardPeg <= 2 ? "Fair Value"
                  : "Overvalued"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
