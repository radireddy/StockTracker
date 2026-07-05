# Projections & Valuations Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the accordion-per-model layout with horizontal model tabs, reorder page sections (P&L → Expected Returns → Scenarios → PEG), and give the valuation scenarios table a V1 chip-row design with proper SVG Bull/Base/Bear icons.

**Architecture:** Two component rewrites, no logic changes. `ValuationScenarios` drops its Expected Returns input (parent owns it now) and gets a new chip-row table. `ProjectionsValuationTab` replaces the accordion with tabs + Add Model dropdown + delete confirmation, and adds an Expected Returns bar between the P&L panel and the scenarios.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Lucide icons, existing `@/components/ui/` primitives (Button, AlertDialog, DropdownMenu).

## Global Constraints

- `ScenarioType = "bull" | "base" | "bare"` — DB value `"bare"` is unchanged; only the display label changes to `"Bear"`
- Table columns come from `strategy.getValuationFields()` — do NOT hardcode PE-specific columns; EV/EBITDA has different fields
- No changes to server actions, DB schema, projection strategies, or tests
- Follow existing import style — named exports, `"use client"` at top, `─── Section ───` comments
- Tailwind only — no inline `style=` except where Tailwind can't express the value

---

## File Map

| File | What changes |
|---|---|
| `src/components/company/valuation-scenarios.tsx` | Full rewrite — chip-row table, SVG icons, drop `onExpReturnsChange` prop |
| `src/components/company/projections-valuation-tab.tsx` | Full rewrite — model tabs, Add Model dropdown, delete dialog, Expected Returns bar, collapsible P&L |
| `src/components/company/projection-grid.tsx` | No changes — parent wraps it in a collapsible panel |

---

## Task 1: Rewrite `valuation-scenarios.tsx` — chip-row table with SVG icons

**Files:**
- Modify: `src/components/company/valuation-scenarios.tsx`

**Interfaces:**
- Removes prop: `onExpReturnsChange: (val: number) => void` (parent owns the input now)
- Keeps prop: `expReturns: number` (still needed for `computeValuationDerived`)
- All other props unchanged

- [ ] **Step 1: Replace the entire file content**

```tsx
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
      {/* left horn */}
      <path d="M5.5 9.5 C5 7, 3 4, 4.5 2 C5.2 1, 6.5 1.5, 7 3.5 L7.5 6.5 Z" opacity={0.9} />
      {/* right horn */}
      <path d="M14.5 9.5 C15 7, 17 4, 15.5 2 C14.8 1, 13.5 1.5, 13 3.5 L12.5 6.5 Z" opacity={0.9} />
      {/* head */}
      <ellipse cx="10" cy="13" rx="7" ry="5.5" />
      {/* muzzle */}
      <ellipse cx="10" cy="16.2" rx="3.5" ry="2" opacity={0.35} />
      {/* nostrils */}
      <circle cx="8.3" cy="16.2" r="1.1" />
      <circle cx="11.7" cy="16.2" r="1.1" />
    </svg>
  );
}

function BaseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden>
      {/* pole */}
      <line x1="10" y1="2" x2="10" y2="18" />
      {/* arm */}
      <line x1="3" y1="6" x2="17" y2="6" />
      {/* left string + pan */}
      <line x1="3" y1="6" x2="3" y2="9" />
      <path d="M1 9 Q3 12.5 5 9" />
      {/* right string + pan */}
      <line x1="17" y1="6" x2="17" y2="9" />
      <path d="M15 9 Q17 12.5 19 9" />
      {/* base */}
      <line x1="7" y1="18" x2="13" y2="18" />
    </svg>
  );
}

function BearIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" stroke="none" width="14" height="14" aria-hidden>
      {/* ears */}
      <circle cx="5" cy="5.5" r="3.2" />
      <circle cx="15" cy="5.5" r="3.2" />
      {/* head */}
      <circle cx="10" cy="12.5" r="7" />
      {/* muzzle */}
      <ellipse cx="10" cy="15.5" rx="3.5" ry="2.2" opacity={0.3} />
      {/* nose */}
      <ellipse cx="10" cy="14.3" rx="2.2" ry="1.4" opacity={0.9} />
      {/* eyes */}
      <circle cx="7.2" cy="11.5" r="1" fill="white" />
      <circle cx="12.8" cy="11.5" r="1" fill="white" />
    </svg>
  );
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SCENARIO_CFG = {
  bull: {
    label: "Bull",
    Icon: BullIcon,
    rowCls: "bg-green-50/60 dark:bg-green-950/20",
    chipCls: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400",
    iconCls: "bg-green-600 dark:bg-green-500",
    irrCls: "text-green-700 dark:text-green-400",
  },
  base: {
    label: "Base",
    Icon: BaseIcon,
    rowCls: "bg-blue-50/60 dark:bg-blue-950/20",
    chipCls: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400",
    iconCls: "bg-blue-600 dark:bg-blue-500",
    irrCls: "text-blue-700 dark:text-blue-400",
  },
  bare: {
    label: "Bear",   // display rename; DB key stays "bare"
    Icon: BearIcon,
    rowCls: "bg-red-50/60 dark:bg-red-950/20",
    chipCls: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400",
    iconCls: "bg-red-600 dark:bg-red-500",
    irrCls: "text-red-600 dark:text-red-400",
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
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30">
              <th className="py-2 px-4 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground w-44">
                Scenario
              </th>
              {inputFields.map((f) => (
                <th key={f.key} className="py-2 px-4 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {f.label}
                </th>
              ))}
              {outputFields.map((f) => (
                <th key={f.key} className="py-2 px-4 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
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
                <tr key={type} className={`border-b border-border/30 last:border-0 ${cfg.rowCls}`}>
                  {/* Scenario chip */}
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full border ${cfg.chipCls}`}>
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-white ${cfg.iconCls}`}>
                        <cfg.Icon />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-wider">{cfg.label}</span>
                    </span>
                  </td>

                  {/* Input columns */}
                  {inputFields.map((f, colIdx) => (
                    <td key={f.key} className="py-3 px-4 text-center">
                      <input
                        type="number"
                        step="any"
                        data-row={rowIdx}
                        data-col={colIdx}
                        className="w-20 h-8 text-right text-sm tabular-nums rounded-md border border-border/60 bg-background/80 px-2 outline-none transition-all hover:border-border focus:border-primary focus:ring-1 focus:ring-primary/30 focus:bg-background"
                        placeholder="—"
                        value={inputs[f.key] ?? ""}
                        onChange={(e) => onScenarioChange(type, f.key, e.target.value)}
                        onKeyDown={handleGridKeyDown}
                      />
                    </td>
                  ))}

                  {/* Output columns */}
                  {outputFields.map((f) => {
                    const live = derived[f.key] ?? null;
                    const stale = stored[f.key] ?? null;
                    const val = live ?? stale;
                    const isStale = live == null && stale != null;
                    const isIrr = f.key === "irr";
                    const isBuyPrice = f.key === "buy_price";

                    return (
                      <td key={f.key} className="py-3 px-4 text-right">
                        {val != null ? (
                          <span className={[
                            "tabular-nums",
                            isStale ? "italic text-muted-foreground" : "",
                            isIrr ? `text-base font-extrabold ${cfg.irrCls}` : "",
                            isBuyPrice ? "text-sm font-bold" : "",
                            !isIrr && !isBuyPrice ? "text-sm text-muted-foreground" : "",
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

      {/* ── PEG strip ───────────────────────────────────────────────── */}
      {horizonPeg && (
        <div className="flex flex-wrap items-end gap-6 rounded-md border border-border/50 px-4 py-3 bg-muted/20">
          <div>
            <p className="text-xs text-muted-foreground">Trailing PE</p>
            <p className="text-sm font-semibold tabular-nums">
              {horizonPeg.currentPe != null
                ? horizonPeg.currentPe.toLocaleString("en-IN", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Earnings CAGR ({horizon}Y)</p>
            <p className="text-sm font-semibold tabular-nums">
              {horizonPeg.earningsCagr != null ? `${horizonPeg.earningsCagr}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Forward PEG Ratio</p>
            <p className={`text-sm font-bold tabular-nums ${
              horizonPeg.forwardPeg == null ? "" :
              horizonPeg.forwardPeg < 1 ? "text-green-700 dark:text-green-400" :
              horizonPeg.forwardPeg <= 2 ? "text-amber-700 dark:text-amber-400" :
              "text-red-700 dark:text-red-400"
            }`}>
              {horizonPeg.forwardPeg != null
                ? horizonPeg.forwardPeg.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
                : "—"}
            </p>
          </div>
          {horizonPeg.forwardPeg != null && (
            <p className="text-xs text-muted-foreground">
              {horizonPeg.forwardPeg < 1 ? "Potentially undervalued"
                : horizonPeg.forwardPeg <= 2 ? "Fairly valued"
                : "Potentially overvalued"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/ravindraadireddy/StockTracker && npx tsc --noEmit 2>&1 | head -30
```

Expected: zero errors in `valuation-scenarios.tsx`. The parent still passes `onExpReturnsChange` so you'll see a TS error there — that's expected and fixed in Task 2.

- [ ] **Step 3: Commit**

```bash
git add src/components/company/valuation-scenarios.tsx
git commit -m "feat(projections): chip-row scenario table with Bull/Base/Bear SVG icons"
```

---

## Task 2: Rewrite `projections-valuation-tab.tsx` — tabs, dropdown, Expected Returns bar

**Files:**
- Modify: `src/components/company/projections-valuation-tab.tsx`

**Interfaces:**
- External props unchanged: `{ company, projectionModels, onBaseIrrChange }`
- `ValuationScenarios` call drops `onExpReturnsChange`; adds nothing new

- [ ] **Step 1: Replace the entire file content**

```tsx
"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { ChevronDown, ChevronRight, Plus, Save, Star, Trash2 } from "lucide-react";
import { ProjectionGrid } from "@/components/company/projection-grid";
import { ValuationScenarios } from "@/components/company/valuation-scenarios";
import { getStrategy, getAvailableTypesExcluding } from "@/lib/projections/registry";
import {
  createProjectionModel,
  deleteProjectionModel,
  saveAllProjections,
  setDefaultProjectionModel,
} from "@/app/(authenticated)/actions/projection-actions";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import { marketCapInCrores } from "@/lib/utils/calculations";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import type { Company, ProjectionModel, FinancialYear, ProjectionType } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScenarioType = "bull" | "base" | "bare";

interface ModelState {
  model: ProjectionModel;
  financialYears: FinancialYear[];
  overrides: Set<string>;
  scenarioData: Record<ScenarioType, Record<string, number | null>>;
  storedDerivedScenarios: Record<ScenarioType, Record<string, number | null>>;
  expReturns: number;
}

// ─── Add-model dropdown metadata ─────────────────────────────────────────────

// Icons for the dropdown (simple inline SVG, not exported)
function EvsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden>
      <polygon points="10,3 18,17 2,17" />
      <line x1="10" y1="10" x2="10" y2="17" />
    </svg>
  );
}

const REGISTRY_META: Record<string, { description: string; Icon: () => JSX.Element }> = {
  pe_earnings: {
    description: "Earnings multiple — project PAT and apply a target PE to derive fair value",
    Icon: () => (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden>
        <polyline points="2,14 7,9 11,12 18,5" />
        <polyline points="13,5 18,5 18,10" />
      </svg>
    ),
  },
  ev_ebitda: {
    description: "Enterprise value multiple — project EBITDA and apply a target EV/EBITDA ratio",
    Icon: EvsIcon,
  },
};

const COMING_SOON = [
  { label: "DCF / Cash Flow", description: "Discounted cash flow — intrinsic value from future free cash flows" },
  { label: "SOTP", description: "Sum of the parts — value each business segment separately" },
];

// ─── Helpers (unchanged from original) ───────────────────────────────────────

const PCT_FIELDS = [
  "revenue_growth_pct", "ebitda_margin_pct", "ebitda_growth_pct",
  "tax_pct", "pat_growth_pct", "pat_margin_pct",
] as const;

function normalizePct(val: number | null): number | null {
  if (val == null) return null;
  if (Math.abs(val) <= 1 && val !== 0) return val * 100;
  return val;
}

function normalizeFinancialYears(years: FinancialYear[]): FinancialYear[] {
  return years.map((fy) => {
    const normalized = { ...fy };
    for (const field of PCT_FIELDS) {
      (normalized as Record<string, unknown>)[field] = normalizePct(fy[field] as number | null);
    }
    return normalized;
  });
}

function getCurrentFYNum(): number {
  const now = new Date();
  return now.getMonth() >= 3 ? (now.getFullYear() + 1) % 100 : now.getFullYear() % 100;
}

function generateDefaultYears(companyId: string, projectionModelId: string, horizonYears: number): FinancialYear[] {
  const currentFY = getCurrentFYNum();
  const prevFY = currentFY - 1;
  const columnCount = 1 + horizonYears;
  return Array.from({ length: columnCount }, (_, i) => {
    const fyNum = prevFY + i;
    const isEst = i > 0;
    return {
      id: crypto.randomUUID(),
      company_id: companyId,
      projection_model_id: projectionModelId,
      user_id: "",
      year: `FY${fyNum}${isEst ? "E" : ""}`,
      is_estimate: isEst,
      sort_order: i,
      revenue: null, revenue_growth_pct: null, ebitda: null, ebitda_margin_pct: null,
      ebitda_growth_pct: null, depreciation: null, finance_cost: null, other_income: null,
      exceptional_items: 0, pbt: null, tax_pct: 25, pat: null, pat_growth_pct: null,
      pat_margin_pct: null, minority_interest: null, pat_for_shareholders: null,
      pe: null, peg: null, net_debt: null, lease_liability: null,
      total_debt: null, ev_ebitda_ratio: null,
      created_at: "", updated_at: "",
    };
  });
}

function oKey(field: string, yearIdx: number) {
  return `${field}-${yearIdx}`;
}

function initModelState(model: ProjectionModel, company: Company): ModelState {
  const strategy = getStrategy(model.projection_type);
  const autoKeys = new Set(strategy.rowConfigs.filter((r) => r.type === "auto").map((r) => r.key));
  const rawYears = model.financial_years ?? [];
  let financialYears: FinancialYear[];
  if (rawYears.length > 0) {
    financialYears = normalizeFinancialYears(rawYears);
  } else {
    financialYears = generateDefaultYears(company.id, model.id, company.investment_horizon_years ?? 3);
  }
  const lockedKeys = new Set(strategy.rowConfigs.filter((r) => r.locked).map((r) => r.key));
  const overrides = new Set<string>();
  (model.financial_years ?? []).forEach((fy, idx) => {
    autoKeys.forEach((key) => {
      if (!lockedKeys.has(key) && fy[key as keyof FinancialYear] != null) overrides.add(oKey(key, idx));
    });
  });
  const valuationFields = strategy.getValuationFields();
  const inputFields = valuationFields.filter((f) => f.isInput).map((f) => f.key);
  const derivedFieldKeys = valuationFields.filter((f) => !f.isInput).map((f) => f.key);
  const scenarioData: Record<ScenarioType, Record<string, number | null>> = { bull: {}, base: {}, bare: {} };
  const storedDerivedScenarios: Record<ScenarioType, Record<string, number | null>> = { bull: {}, base: {}, bare: {} };
  for (const vs of model.valuation_scenarios ?? []) {
    const type = vs.scenario_type as ScenarioType;
    if (type in scenarioData) {
      const row = vs as unknown as Record<string, number | null>;
      for (const key of inputFields) scenarioData[type][key] = row[key] ?? null;
      for (const key of derivedFieldKeys) storedDerivedScenarios[type][key] = row[key] ?? null;
    }
  }
  const expReturns = company.expected_returns != null ? company.expected_returns * 100 : 25;
  return { model, financialYears, overrides, scenarioData, storedDerivedScenarios, expReturns };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProjectionsValuationTab({
  company,
  projectionModels,
  onBaseIrrChange,
}: {
  company: Company;
  projectionModels: ProjectionModel[];
  onBaseIrrChange?: (irr: number | null) => void;
}) {
  const router = useRouter();

  const [modelStates, setModelStates] = useState<ModelState[]>(() =>
    projectionModels.map((m) => initModelState(m, company))
  );

  // Active tab — default to the default model, else first
  const [activeModelId, setActiveModelId] = useState<string | null>(() => {
    const def = projectionModels.find((m) => m.is_default);
    return def?.id ?? projectionModels[0]?.id ?? null;
  });

  // P&L collapsible
  const [projOpen, setProjOpen] = useState(true);

  // Add-model dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [saving, setSaving] = useState(false);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  // Compute base IRR and report to parent
  const computedBaseIrr = useMemo(() => {
    const defaultMs = modelStates.find((ms) => ms.model.is_default);
    if (!defaultMs) return null;
    const strategy = getStrategy(defaultMs.model.projection_type);
    const computedYears = strategy.computeFields(defaultMs.financialYears, defaultMs.overrides, marketCapInCrores(company.indian_stocks?.market_cap));
    const terminalYear = computedYears[computedYears.length - 1] ?? null;
    const estimateYears = defaultMs.financialYears.filter((fy) => fy.is_estimate).length;
    const companyForCalc = {
      market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
      current_price: company.indian_stocks?.price ?? null,
      expected_returns: defaultMs.expReturns,
      investment_horizon_years: estimateYears || company.investment_horizon_years,
    };
    const derived = strategy.computeValuationDerived(defaultMs.scenarioData.base, terminalYear, companyForCalc);
    return derived.irr ?? null;
  }, [modelStates, company]);

  useEffect(() => {
    onBaseIrrChange?.(computedBaseIrr);
  }, [computedBaseIrr, onBaseIrrChange]);

  // Available model types (not yet added)
  const availableTypes = useMemo(() => {
    const existingTypes = modelStates.map((ms) => ms.model.projection_type);
    return getAvailableTypesExcluding(existingTypes);
  }, [modelStates]);

  // ─── Handlers (logic unchanged, just moved) ───────────────────────────────

  const handleCellChange = useCallback((modelId: string, yearIdx: number, key: string, value: string) => {
    setModelStates((prev) =>
      prev.map((ms) => {
        if (ms.model.id !== modelId) return ms;
        const strategy = getStrategy(ms.model.projection_type);
        const autoKeys = new Set(strategy.rowConfigs.filter((r) => r.type === "auto").map((r) => r.key));
        const nextYears = [...ms.financialYears];
        nextYears[yearIdx] = { ...nextYears[yearIdx], [key]: value === "" ? null : Number(value) };
        let nextOverrides = ms.overrides;
        if (autoKeys.has(key)) {
          nextOverrides = new Set(ms.overrides);
          if (value === "") nextOverrides.delete(oKey(key, yearIdx));
          else nextOverrides.add(oKey(key, yearIdx));
        }
        return { ...ms, financialYears: nextYears, overrides: nextOverrides };
      })
    );
  }, []);

  const handleYearChange = useCallback((modelId: string, idx: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setModelStates((prev) =>
      prev.map((ms) => {
        if (ms.model.id !== modelId) return ms;
        const nextYears = [...ms.financialYears];
        nextYears[idx] = { ...nextYears[idx], year: trimmed, is_estimate: trimmed.endsWith("E") };
        return { ...ms, financialYears: nextYears };
      })
    );
  }, []);

  const handleAddYear = useCallback((modelId: string) => {
    setModelStates((prev) =>
      prev.map((ms) => {
        if (ms.model.id !== modelId) return ms;
        const years = ms.financialYears;
        const lastYear = years[years.length - 1]?.year ?? "FY25";
        const match = lastYear.match(/FY(\d+)/);
        const nextNum = match ? parseInt(match[1]) + 1 : 26;
        const newYear: FinancialYear = {
          id: crypto.randomUUID(),
          company_id: company.id,
          projection_model_id: ms.model.id,
          user_id: "",
          year: `FY${nextNum}E`,
          is_estimate: true,
          sort_order: years.length,
          revenue: null, revenue_growth_pct: null, ebitda: null, ebitda_margin_pct: null,
          ebitda_growth_pct: null, depreciation: null, finance_cost: null, other_income: null,
          exceptional_items: 0, pbt: null, tax_pct: 25, pat: null, pat_growth_pct: null,
          pat_margin_pct: null, minority_interest: null, pat_for_shareholders: null,
          pe: null, peg: null, net_debt: null, lease_liability: null,
          total_debt: null, ev_ebitda_ratio: null,
          created_at: "", updated_at: "",
        };
        return { ...ms, financialYears: [...years, newYear] };
      })
    );
  }, [company.id]);

  const handleRemoveYear = useCallback((modelId: string, idx: number) => {
    setModelStates((prev) =>
      prev.map((ms) => {
        if (ms.model.id !== modelId) return ms;
        const nextYears = ms.financialYears.filter((_, i) => i !== idx);
        const nextOverrides = new Set<string>();
        ms.overrides.forEach((k) => {
          const dashIdx = k.lastIndexOf("-");
          const [field, yIdx] = [k.slice(0, dashIdx), parseInt(k.slice(dashIdx + 1))];
          if (yIdx < idx) nextOverrides.add(k);
          else if (yIdx > idx) nextOverrides.add(oKey(field, yIdx - 1));
        });
        return { ...ms, financialYears: nextYears, overrides: nextOverrides };
      })
    );
  }, []);

  const handleScenarioChange = useCallback((modelId: string, type: ScenarioType, key: string, value: string) => {
    setModelStates((prev) =>
      prev.map((ms) => {
        if (ms.model.id !== modelId) return ms;
        const numVal = value === "" ? null : Number(value);
        return { ...ms, scenarioData: { ...ms.scenarioData, [type]: { ...ms.scenarioData[type], [key]: numVal } } };
      })
    );
  }, []);

  const handleExpReturnsChange = useCallback((val: number) => {
    setModelStates((prev) => prev.map((ms) => ({ ...ms, expReturns: val })));
  }, []);

  const handleAddModel = useCallback(async (type: ProjectionType, label: string) => {
    setDropdownOpen(false);
    const isDefault = modelStates.length === 0;
    const res = await createProjectionModel(company.id, type, label, isDefault);
    if (!res.ok) return toastError(res);
    const pm: ProjectionModel = {
      ...(res.data as unknown as ProjectionModel),
      financial_years: [],
      valuation_scenarios: [],
    };
    const ms = initModelState(pm, company);
    setModelStates((prev) => [...prev, ms]);
    setActiveModelId(pm.id);
  }, [company, modelStates.length]);

  const handleSetDefault = useCallback(async (modelId: string) => {
    const res = await setDefaultProjectionModel(company.id, modelId);
    if (!res.ok) return toastError(res);
    setModelStates((prev) =>
      prev.map((ms) => ({ ...ms, model: { ...ms.model, is_default: ms.model.id === modelId } }))
    );
  }, [company.id]);

  const handleDeleteModel = useCallback(async () => {
    if (!deleteTarget) return;
    const res = await deleteProjectionModel(deleteTarget.id, company.id);
    if (!res.ok) return toastError(res);
    setModelStates((prev) => {
      const next = prev.filter((ms) => ms.model.id !== deleteTarget.id);
      // If we deleted the active tab, fall back to first remaining
      if (activeModelId === deleteTarget.id) {
        setActiveModelId(next[0]?.model.id ?? null);
      }
      return next;
    });
    setDeleteTarget(null);
  }, [deleteTarget, company.id, activeModelId]);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const models = modelStates.map((ms) => {
        const strategy = getStrategy(ms.model.projection_type);
        const computedYears = strategy.computeFields(ms.financialYears, ms.overrides, marketCapInCrores(company.indian_stocks?.market_cap));
        const terminalYear = computedYears[computedYears.length - 1] ?? null;
        const estimateYears = ms.financialYears.filter((fy) => fy.is_estimate).length;
        const companyForCalc = {
          market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
          current_price: company.indian_stocks?.price ?? null,
          expected_returns: ms.expReturns,
          investment_horizon_years: estimateYears || company.investment_horizon_years,
        };
        const scenarios = (["bull", "base", "bare"] as const).map((type) => ({
          scenario_type: type,
          ...strategy.computeValuationDerived(ms.scenarioData[type], terminalYear, companyForCalc),
          ...ms.scenarioData[type],
        }));
        const autoKeys = new Set(strategy.rowConfigs.filter((r) => r.type === "auto").map((r) => r.key));
        return {
          projection_model_id: ms.model.id,
          financial_years: computedYears.map(({ id, user_id, created_at, updated_at, ...fy }, idx) => {
            const row: Record<string, unknown> = { ...fy, sort_order: idx };
            autoKeys.forEach((key) => {
              if (!ms.overrides.has(oKey(key, idx))) row[key] = null;
            });
            return row;
          }),
          valuation_scenarios: scenarios,
        };
      });
      const expReturns = modelStates[0]?.expReturns ?? 25;
      const [saveRes] = await Promise.all([
        saveAllProjections(company.id, models),
        updateCompany(company.id, { expected_returns: expReturns / 100 }),
      ]);
      if (!saveRes.ok) return toastError(saveRes);
      router.refresh();
      toast.success("Projections saved");
    } catch (err) {
      toastError(err, { message: "Couldn't save your projections." });
    } finally {
      setSaving(false);
    }
  }, [modelStates, company, router]);

  // ─── Active model derived data ────────────────────────────────────────────

  const activeMs = modelStates.find((ms) => ms.model.id === activeModelId) ?? modelStates[0] ?? null;

  const activeComputed = useMemo(() => {
    if (!activeMs) return null;
    const strategy = getStrategy(activeMs.model.projection_type);
    const computedYears = strategy.computeFields(
      activeMs.financialYears,
      activeMs.overrides,
      marketCapInCrores(company.indian_stocks?.market_cap),
    );
    const estimateYears = activeMs.financialYears.filter((fy) => fy.is_estimate).length;
    return { strategy, computedYears, estimateYears };
  }, [activeMs, company]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground">Projections &amp; Valuations</h2>
        {modelStates.length > 0 && (
          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={saving}
            className="h-8 px-4 text-xs gap-1.5 rounded-full"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save All"}
          </Button>
        )}
      </div>

      {/* ── Model tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border/60 mb-5 overflow-x-auto">
        {modelStates.map((ms) => {
          const strategy = getStrategy(ms.model.projection_type);
          const isActive = ms.model.id === activeModelId;
          return (
            <button
              key={ms.model.id}
              type="button"
              onClick={() => setActiveModelId(ms.model.id)}
              className={[
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-t-md text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
              ].join(" ")}
            >
              {strategy.label}
              {ms.model.is_default && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-amber/15 text-amber px-1.5 py-0.5 rounded">
                  Default
                </span>
              )}
              {/* Delete button — only on non-default models */}
              {!ms.model.is_default && (
                <span
                  role="button"
                  aria-label={`Delete ${strategy.label}`}
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: ms.model.id, name: strategy.label }); }}
                  className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-destructive/15 hover:text-destructive transition-colors"
                >
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <line x1="1" y1="1" x2="9" y2="9" /><line x1="9" y1="1" x2="1" y2="9" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}

        {/* + Add Model dropdown */}
        {availableTypes.length > 0 && (
          <div className="relative ml-1" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className={[
                "inline-flex items-center gap-1.5 px-3 py-2 rounded-t-md text-xs font-medium border border-dashed border-border/60 -mb-px transition-all",
                dropdownOpen
                  ? "border-primary/60 text-primary bg-primary/5 border-solid"
                  : "text-muted-foreground hover:border-border hover:text-foreground",
              ].join(" ")}
            >
              <Plus className="h-3 w-3" />
              Add Model
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-72 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                  Choose valuation model
                </p>

                {/* Available (from registry) */}
                {availableTypes.map((t) => {
                  const meta = REGISTRY_META[t.type];
                  const Icon = meta?.Icon;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      onClick={() => handleAddModel(t.type, t.label)}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0"
                    >
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary flex-shrink-0 mt-0.5">
                        {Icon ? <Icon /> : null}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5">{meta?.description ?? ""}</span>
                      </span>
                    </button>
                  );
                })}

                {/* Coming soon items */}
                {COMING_SOON.map((cs) => (
                  <div key={cs.label} className="flex items-start gap-3 px-4 py-3 opacity-40 border-t border-border/30 cursor-not-allowed">
                    <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground flex-shrink-0 mt-0.5">
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" width="16" height="16" aria-hidden>
                        <circle cx="10" cy="10" r="8" /><path d="M10 6v4l2.5 2.5" />
                      </svg>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{cs.label}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">{cs.description}</span>
                      <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        Coming soon
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {modelStates.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center text-muted-foreground">
          <p>No projection models yet. Click <span className="font-medium">Add Model</span> to create your first projection.</p>
        </div>
      )}

      {/* ── Active model content ─────────────────────────────────────── */}
      {activeMs && activeComputed && (() => {
        const { strategy, computedYears, estimateYears } = activeComputed;
        const companyForScenarios = {
          market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
          current_price: company.indian_stocks?.price ?? null,
          expected_returns: company.expected_returns,
          investment_horizon_years: estimateYears || company.investment_horizon_years,
        };

        return (
          <div className="space-y-5">
            {/* ── 1. P&L Projections (collapsible) ─────────────────── */}
            <div>
              <div
                role="button"
                aria-expanded={projOpen}
                onClick={() => setProjOpen((v) => !v)}
                className="flex items-center justify-between px-4 py-2.5 rounded-t-lg border border-border/60 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  {projOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-sm font-semibold">Profit &amp; Loss</span>
                  <span className="text-xs text-muted-foreground">· ₹ Crores</span>
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddYear(activeMs.model.id)}
                    className="h-7 px-3 text-xs gap-1 rounded-full"
                  >
                    <Plus className="h-3 w-3" /> Add Year
                  </Button>
                </div>
              </div>
              {projOpen && (
                <div className="border border-t-0 border-border/60 rounded-b-lg overflow-hidden">
                  <ProjectionGrid
                    data={computedYears}
                    rowConfigs={strategy.rowConfigs}
                    overrides={activeMs.overrides}
                    onCellChange={(yearIdx, key, value) => handleCellChange(activeMs.model.id, yearIdx, key, value)}
                    onYearChange={(idx, value) => handleYearChange(activeMs.model.id, idx, value)}
                    onAddYear={() => handleAddYear(activeMs.model.id)}
                    onRemoveYear={(idx) => handleRemoveYear(activeMs.model.id, idx)}
                  />
                </div>
              )}
            </div>

            {/* ── 2. Expected Returns ───────────────────────────────── */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2 after:flex-1 after:h-px after:bg-border/60 after:content-['']">
                Expected Returns
              </h3>
              <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg border border-border/60 bg-muted/20">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-foreground whitespace-nowrap">Expected Returns</label>
                  <input
                    type="number"
                    step="any"
                    className="w-16 h-8 text-right text-sm font-bold tabular-nums rounded-md border border-border/60 bg-background px-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                    value={activeMs.expReturns}
                    onChange={(e) => handleExpReturnsChange(e.target.value === "" ? 25 : Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">% / year</span>
                </div>
                {/* Context stats */}
                <div className="ml-auto flex items-center gap-0 divide-x divide-border/60">
                  {[
                    {
                      label: "Current Mkt Cap",
                      value: (() => { const mc = marketCapInCrores(company.indian_stocks?.market_cap); return mc != null ? `₹${Math.round(mc).toLocaleString("en-IN")} Cr` : "—"; })(),
                    },
                    { label: "CMP", value: company.indian_stocks?.price != null ? `₹${company.indian_stocks.price.toLocaleString("en-IN")}` : "—" },
                    {
                      label: "Terminal PAT",
                      value: (() => {
                        const t = computedYears[computedYears.length - 1];
                        return t?.pat != null ? `₹${Math.round(t.pat).toLocaleString("en-IN")} Cr` : "—";
                      })(),
                    },
                    {
                      label: "Horizon",
                      value: estimateYears ? `${estimateYears} yrs` : (company.investment_horizon_years ? `${company.investment_horizon_years} yrs` : "—"),
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-3 first:pl-0 last:pr-0">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
                      <p className="text-sm font-semibold tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── 3. Valuation Scenarios ────────────────────────────── */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2 after:flex-1 after:h-px after:bg-border/60 after:content-['']">
                Valuation Scenarios
              </h3>
              <ValuationScenarios
                strategy={strategy}
                scenarioData={activeMs.scenarioData}
                storedDerivedScenarios={activeMs.storedDerivedScenarios}
                financialYears={computedYears}
                company={companyForScenarios}
                expReturns={activeMs.expReturns}
                onScenarioChange={(type, key, value) => handleScenarioChange(activeMs.model.id, type, key, value)}
              />
            </div>
          </div>
        );
      })()}

      {/* ── Delete confirmation ──────────────────────────────────────── */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Projection Model</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{deleteTarget?.name}&rdquo;? This permanently removes all its financial projections and valuation scenarios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteModel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles with zero errors**

```bash
cd /Users/ravindraadireddy/StockTracker && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. Common fix if errors appear: check that `IIFE` pattern (`(() => { ... })()`) in JSX is valid — if TS complains, extract the active model render into a small `ActiveModelContent` component or a variable.

- [ ] **Step 3: Run the dev server and verify visually**

```bash
cd /Users/ravindraadireddy/StockTracker && npm run dev
```

Open a company's Projections tab and confirm:
- Horizontal model tabs appear with Default badge on PE / Earnings
- P&L table is in a collapsible panel (open by default, chevron toggles it)
- "Expected Returns" label + input + stats bar appears between P&L and scenarios
- Scenario table shows Bull (bull head icon), Base (scales icon), Bear (bear head icon) chips with tinted rows
- "Bear" appears as the label (not "Bare")
- IRR column is large and coloured (green/blue/red)
- + Add Model dropdown opens with EV/EBITDA (if not yet added) and DCF/SOTP as coming-soon items
- Clicking × on a non-default model tab opens the confirmation dialog
- Confirming delete removes the tab and switches to the first remaining tab

- [ ] **Step 4: Commit**

```bash
git add src/components/company/projections-valuation-tab.tsx
git commit -m "feat(projections): tabs + Add Model dropdown + Expected Returns bar + new section order"
```

---

## Self-Review

**Spec coverage:**
- ✅ Model tabs with Default badge — Tab bar in render
- ✅ × delete on non-default tabs → confirmation dialog — `setDeleteTarget` + AlertDialog
- ✅ +Add Model dropdown with icon + description + coming-soon items — `dropdownOpen` div
- ✅ P&L collapsible panel (default open) — `projOpen` state + chevron button
- ✅ Expected Returns section label + bar — section rendered between P&L and scenarios
- ✅ Scenario table: chip row, SVG icons, tinted rows, IRR coloured — Task 1
- ✅ Bare → Bear display rename — `SCENARIO_CFG.bare.label = "Bear"`
- ✅ PEG strip below scenarios — kept in `ValuationScenarios`
- ✅ No DB/action/strategy changes — confirmed, only UI files touched
- ✅ `onExpReturnsChange` removed from `ValuationScenarios` props — Task 1 drops it, Task 2 handles input in parent

**Placeholder scan:** No TBDs, no "handle appropriately", all code is complete.

**Type consistency:**
- `handleExpReturnsChange(val: number)` — called with `Number(e.target.value)` ✅
- `handleScenarioChange(modelId, type, key, value)` — matches definition ✅
- `ValuationScenarios` props — `expReturns: number`, `onScenarioChange` — matches Task 1 interface ✅
- `activeMs.expReturns` — exists on `ModelState` ✅
