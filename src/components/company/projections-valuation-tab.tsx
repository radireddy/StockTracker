"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { Company, ProjectionModel, FinancialYear, ProjectionType } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

type ScenarioType = "bull" | "base" | "bare";

interface ModelState {
  model: ProjectionModel;
  financialYears: FinancialYear[];
  overrides: Set<string>;
  scenarioData: Record<ScenarioType, Record<string, number | null>>;
  expReturns: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  return now.getMonth() >= 3
    ? (now.getFullYear() + 1) % 100
    : now.getFullYear() % 100;
}

function generateDefaultYears(companyId: string, projectionModelId: string, horizonYears: number): FinancialYear[] {
  const currentFY = getCurrentFYNum();
  const prevFY = currentFY - 1;
  const columnCount = 1 + horizonYears; // 1 actual + horizon projected
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

  // Normalize financial years
  const rawYears = model.financial_years ?? [];
  let financialYears: FinancialYear[];
  if (rawYears.length > 0) {
    financialYears = normalizeFinancialYears(rawYears);
  } else {
    financialYears = generateDefaultYears(company.id, model.id, company.investment_horizon_years ?? 3);
  }

  // Build overrides set from existing auto fields that have values
  const overrides = new Set<string>();
  (model.financial_years ?? []).forEach((fy, idx) => {
    autoKeys.forEach((key) => {
      if (fy[key as keyof FinancialYear] != null) overrides.add(oKey(key, idx));
    });
  });

  // Build scenarioData from existing valuation_scenarios (extract input fields only)
  const inputFields = strategy.getValuationFields().filter((f) => f.isInput).map((f) => f.key);
  const scenarioData: Record<ScenarioType, Record<string, number | null>> = {
    bull: {}, base: {}, bare: {},
  };
  for (const vs of model.valuation_scenarios ?? []) {
    const type = vs.scenario_type as ScenarioType;
    if (type in scenarioData) {
      for (const key of inputFields) {
        scenarioData[type][key] = (vs as unknown as Record<string, number | null>)[key] ?? null;
      }
    }
  }

  const expReturns = company.expected_returns != null
    ? company.expected_returns * 100
    : 25;

  return { model, financialYears, overrides, scenarioData, expReturns };
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

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const defaultModel = projectionModels.find((m) => m.is_default);
    return new Set(defaultModel ? [defaultModel.id] : projectionModels.length > 0 ? [projectionModels[0].id] : []);
  });

  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Compute and report base IRR from default model whenever state changes
  const computedBaseIrr = useMemo(() => {
    const defaultMs = modelStates.find((ms) => ms.model.is_default);
    if (!defaultMs) return null;

    const strategy = getStrategy(defaultMs.model.projection_type);
    const computedYears = strategy.computeFields(defaultMs.financialYears, defaultMs.overrides, marketCapInCrores(company.indian_stocks?.market_cap));
    const terminalYear = computedYears[computedYears.length - 1] ?? null;
    const companyForCalc = {
      market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
      current_price: company.indian_stocks?.price ?? null,
      expected_returns: defaultMs.expReturns,
      investment_horizon_years: company.investment_horizon_years,
    };
    const derived = strategy.computeValuationDerived(
      defaultMs.scenarioData.base,
      terminalYear,
      companyForCalc
    );
    return derived.irr ?? null;
  }, [modelStates, company]);

  useEffect(() => {
    onBaseIrrChange?.(computedBaseIrr);
  }, [computedBaseIrr, onBaseIrrChange]);

  // Available model types to add
  const availableTypes = useMemo(() => {
    const existingTypes = modelStates.map((ms) => ms.model.projection_type);
    return getAvailableTypesExcluding(existingTypes);
  }, [modelStates]);

  // ─── Accordion toggle ──────────────────────────────────────────────────────

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Cell change ───────────────────────────────────────────────────────────

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

  // ─── Year change ───────────────────────────────────────────────────────────

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

  // ─── Add year ──────────────────────────────────────────────────────────────

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

  // ─── Remove year ───────────────────────────────────────────────────────────

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

  // ─── Scenario change ──────────────────────────────────────────────────────

  const handleScenarioChange = useCallback((modelId: string, type: ScenarioType, key: string, value: string) => {
    setModelStates((prev) =>
      prev.map((ms) => {
        if (ms.model.id !== modelId) return ms;
        const numVal = value === "" ? null : Number(value);
        return {
          ...ms,
          scenarioData: {
            ...ms.scenarioData,
            [type]: { ...ms.scenarioData[type], [key]: numVal },
          },
        };
      })
    );
  }, []);

  // ─── Expected returns change (sync across all models) ─────────────────────

  const handleExpReturnsChange = useCallback((modelId: string, val: number) => {
    setModelStates((prev) =>
      prev.map((ms) => ({ ...ms, expReturns: val }))
    );
  }, []);

  // ─── Add model ─────────────────────────────────────────────────────────────

  const handleAddModel = useCallback(async (type: ProjectionType, label: string) => {
    const isDefault = modelStates.length === 0;
    const newModel = await createProjectionModel(company.id, type, label, isDefault);
    const pm: ProjectionModel = {
      ...newModel,
      financial_years: [],
      valuation_scenarios: [],
    };
    const ms = initModelState(pm, company);
    setModelStates((prev) => [...prev, ms]);
    setExpandedIds((prev) => new Set(prev).add(pm.id));
  }, [company, modelStates.length]);

  // ─── Set default ───────────────────────────────────────────────────────────

  const handleSetDefault = useCallback(async (modelId: string) => {
    await setDefaultProjectionModel(company.id, modelId);
    setModelStates((prev) =>
      prev.map((ms) => ({
        ...ms,
        model: { ...ms.model, is_default: ms.model.id === modelId },
      }))
    );
  }, [company.id]);

  // ─── Delete model ──────────────────────────────────────────────────────────

  const handleDeleteModel = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteProjectionModel(deleteTarget.id, company.id);
    setModelStates((prev) => prev.filter((ms) => ms.model.id !== deleteTarget.id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
  }, [deleteTarget, company.id]);

  // ─── Save all ──────────────────────────────────────────────────────────────

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const models = modelStates.map((ms) => {
        const strategy = getStrategy(ms.model.projection_type);
        const computedYears = strategy.computeFields(ms.financialYears, ms.overrides, marketCapInCrores(company.indian_stocks?.market_cap));
        const terminalYear = computedYears[computedYears.length - 1] ?? null;
        const companyForCalc = {
          market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
          current_price: company.indian_stocks?.price ?? null,
          expected_returns: ms.expReturns,
          investment_horizon_years: company.investment_horizon_years,
        };
        const scenarios = (["bull", "base", "bare"] as const).map((type) => ({
          scenario_type: type,
          ...strategy.computeValuationDerived(ms.scenarioData[type], terminalYear, companyForCalc),
          // Also include the input fields
          ...ms.scenarioData[type],
        }));
        return {
          projection_model_id: ms.model.id,
          financial_years: computedYears.map(
            ({ id, user_id, created_at, updated_at, ...fy }, idx) => ({
              ...fy,
              sort_order: idx,
            })
          ),
          valuation_scenarios: scenarios,
        };
      });

      // Determine expReturns to save (all models share the same value)
      const expReturns = modelStates[0]?.expReturns ?? 25;

      await Promise.all([
        saveAllProjections(company.id, models),
        updateCompany(company.id, { expected_returns: expReturns / 100 }),
      ]);

      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [modelStates, company, router]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground">Projections & Valuations</h2>
        <div className="flex items-center gap-2">
          {availableTypes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 rounded-full border border-input bg-background h-8 px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground cursor-pointer">
                <Plus className="h-3.5 w-3.5" /> Add Model
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableTypes.map((t) => (
                  <DropdownMenuItem
                    key={t.type}
                    onClick={() => handleAddModel(t.type, t.label)}
                  >
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {modelStates.length > 0 && (
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={saving}
              className="h-8 px-4 text-xs gap-1.5 rounded-full"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save All"}
            </Button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {modelStates.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center text-muted-foreground">
          <p>No projection models yet. Click <span className="font-medium">Add Model</span> to create your first projection.</p>
        </div>
      )}

      {/* Models accordion */}
      <div className="space-y-3">
        {modelStates.map((ms) => {
          const strategy = getStrategy(ms.model.projection_type);
          const isExpanded = expandedIds.has(ms.model.id);

          // Compute data for the grid (reactive to state changes)
          const computedYears = strategy.computeFields(ms.financialYears, ms.overrides, marketCapInCrores(company.indian_stocks?.market_cap));

          return (
            <div key={ms.model.id} className="rounded-lg border border-border/60 overflow-hidden">
              {/* Accordion header */}
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                onClick={() => toggleExpanded(ms.model.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-semibold text-sm text-foreground">{strategy.label}</span>
                {ms.model.is_default && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded">
                    Default
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {!ms.model.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(ms.model.id)}
                      className="p-1.5 rounded hover:bg-muted transition-colors"
                      title="Set as default"
                    >
                      <Star className="h-3.5 w-3.5 text-muted-foreground hover:text-amber-500" />
                    </button>
                  )}
                  {!ms.model.is_default && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ id: ms.model.id, name: strategy.label })}
                      className="p-1.5 rounded hover:bg-muted transition-colors"
                      title="Delete model"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                    </button>
                  )}
                </div>
              </button>

              {/* Accordion content */}
              {isExpanded && (
                <div className="px-4 py-4 space-y-6">
                  <ProjectionGrid
                    data={computedYears}
                    rowConfigs={strategy.rowConfigs}
                    overrides={ms.overrides}
                    onCellChange={(yearIdx, key, value) =>
                      handleCellChange(ms.model.id, yearIdx, key, value)
                    }
                    onYearChange={(idx, value) =>
                      handleYearChange(ms.model.id, idx, value)
                    }
                    onAddYear={() => handleAddYear(ms.model.id)}
                    onRemoveYear={(idx) => handleRemoveYear(ms.model.id, idx)}
                  />

                  <div>
                    <h3 className="text-lg font-bold text-foreground mb-3">Valuation Scenarios</h3>
                    <ValuationScenarios
                      strategy={strategy}
                      scenarioData={ms.scenarioData}
                      financialYears={computedYears}
                      company={{
                        market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
                        current_price: company.indian_stocks?.price ?? null,
                        expected_returns: company.expected_returns,
                        investment_horizon_years: company.investment_horizon_years,
                      }}
                      expReturns={ms.expReturns}
                      onExpReturnsChange={(val) =>
                        handleExpReturnsChange(ms.model.id, val)
                      }
                      onScenarioChange={(type, key, value) =>
                        handleScenarioChange(ms.model.id, type, key, value)
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Projection Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the &ldquo;{deleteTarget?.name}&rdquo; projection model?
              This will permanently remove all its financial projections and valuation scenarios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteModel}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
