"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
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

import { ChevronDown, ChevronRight, Plus, Save, Star } from "lucide-react";
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
import { fmtNum, marketCapInCrores } from "@/lib/utils/calculations";
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

// ─── Add-model metadata ───────────────────────────────────────────────────────

const MODEL_META: Record<string, { description: string }> = {
  pe_earnings: { description: "Project PAT and apply a target PE multiple to derive fair value" },
  ev_ebitda: { description: "Project EBITDA and apply a target EV/EBITDA ratio" },
};

const COMING_SOON = [
  { label: "DCF / Cash Flow", description: "Intrinsic value from discounted future free cash flows" },
  { label: "SOTP", description: "Sum of the parts — value each business segment separately" },
];

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

  const [activeModelId, setActiveModelId] = useState<string | null>(() => {
    const def = projectionModels.find((m) => m.is_default);
    return def?.id ?? projectionModels[0]?.id ?? null;
  });

  const [projOpen, setProjOpen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Compute and report base IRR from default model
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

  const availableTypes = useMemo(() => {
    const existingTypes = modelStates.map((ms) => ms.model.projection_type);
    return getAvailableTypesExcluding(existingTypes);
  }, [modelStates]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

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
            autoKeys.forEach((key) => { if (!ms.overrides.has(oKey(key, idx))) row[key] = null; });
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

  // ─── Active model ─────────────────────────────────────────────────────────

  const activeMs = modelStates.find((ms) => ms.model.id === activeModelId) ?? modelStates[0] ?? null;

  const activeStrategy = activeMs ? getStrategy(activeMs.model.projection_type) : null;

  const activeComputedYears = useMemo(() => {
    if (!activeMs || !activeStrategy) return null;
    return activeStrategy.computeFields(
      activeMs.financialYears,
      activeMs.overrides,
      marketCapInCrores(company.indian_stocks?.market_cap),
    );
  }, [activeMs, activeStrategy, company]);

  const activeEstimateYears = useMemo(() => {
    if (!activeMs) return 0;
    return activeMs.financialYears.filter((fy) => fy.is_estimate).length;
  }, [activeMs]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-foreground">Projections &amp; Valuations</h2>
        {modelStates.length > 0 && (
          <Button size="sm" onClick={handleSaveAll} disabled={saving} className="h-8 px-4 text-xs gap-1.5 rounded-full">
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save All"}
          </Button>
        )}
      </div>

      {/* ── Model tabs ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 border-b border-border/60 mb-5 overflow-x-auto">
        {modelStates.map((ms) => {
          const strategy = getStrategy(ms.model.projection_type);
          const isActive = ms.model.id === activeModelId;
          return (
            <button
              key={ms.model.id}
              type="button"
              onClick={() => setActiveModelId(ms.model.id)}
              className={[
                "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap select-none",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {strategy.label}
              <span
                role={ms.model.is_default ? undefined : "button"}
                aria-label={ms.model.is_default ? "Default model" : "Set as default"}
                title={ms.model.is_default ? "Default model" : "Set as default"}
                onClick={(e) => { e.stopPropagation(); if (!ms.model.is_default) handleSetDefault(ms.model.id); }}
                className={`flex items-center justify-center transition-colors ${
                  ms.model.is_default
                    ? "text-amber cursor-default"
                    : "text-muted-foreground hover:text-amber cursor-pointer"
                }`}
              >
                <Star className="h-3.5 w-3.5" fill={ms.model.is_default ? "currentColor" : "none"} />
              </span>
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

        {/* + Add Model */}
        {availableTypes.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-3 py-2 ml-1 rounded-t text-xs font-medium border border-dashed border-border/60 -mb-px text-muted-foreground hover:border-border hover:text-foreground transition-colors cursor-pointer">
              <Plus className="h-3 w-3" />
              Add Model
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 p-0">
              <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                Choose valuation model
              </p>
              {availableTypes.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => handleAddModel(t.type, t.label)}
                  className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border/30 last:border-0 cursor-pointer"
                >
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {MODEL_META[t.type]?.description ?? ""}
                    </span>
                  </span>
                </button>
              ))}
              {COMING_SOON.map((cs) => (
                <div key={cs.label} className="flex items-start gap-3 px-4 py-3 opacity-40 border-t border-border/30 cursor-not-allowed">
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{cs.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{cs.description}</span>
                    <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      Coming soon
                    </span>
                  </span>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Empty state ─────────────────────────────────────────────── */}
      {modelStates.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 py-12 text-center text-muted-foreground">
          <p>No projection models yet. Click <span className="font-medium">Add Model</span> to create your first projection.</p>
        </div>
      )}

      {/* ── Active model content ─────────────────────────────────────── */}
      {activeMs && activeStrategy && activeComputedYears && (
        <div className="space-y-5">
          {/* 1. P&L Projections (collapsible) */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <button
              type="button"
              aria-expanded={projOpen}
              onClick={() => setProjOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors text-left border-b border-border"
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
            </button>
            {projOpen && (
              <ProjectionGrid
                data={activeComputedYears}
                rowConfigs={activeStrategy.rowConfigs}
                overrides={activeMs.overrides}
                onCellChange={(yearIdx, key, value) => handleCellChange(activeMs.model.id, yearIdx, key, value)}
                onYearChange={(idx, value) => handleYearChange(activeMs.model.id, idx, value)}
                onRemoveYear={(idx) => handleRemoveYear(activeMs.model.id, idx)}
              />
            )}
          </div>

          {/* 2. Expected Returns */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 border-b border-border">
              <label className="text-sm font-medium text-foreground whitespace-nowrap">Target Returns</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  className="w-16 h-8 text-right text-sm font-bold tabular-nums rounded-md border border-border bg-background px-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                  value={activeMs.expReturns}
                  onChange={(e) => handleExpReturnsChange(e.target.value === "" ? 25 : Number(e.target.value))}
                />
                <span className="text-sm text-muted-foreground">% / year</span>
              </div>
            </div>
            {/* Reference metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {[
                {
                  label: "Mkt Cap",
                  value: (() => {
                    const mc = marketCapInCrores(company.indian_stocks?.market_cap);
                    return mc != null ? `₹${Math.round(mc).toLocaleString("en-IN")} Cr` : "—";
                  })(),
                },
                {
                  label: "CMP",
                  value: company.indian_stocks?.price != null
                    ? `₹${company.indian_stocks.price.toLocaleString("en-IN")}`
                    : "—",
                },
                {
                  label: activeStrategy.getTerminalMetricLabel(),
                  value: (() => {
                    const terminalYear = activeComputedYears[activeComputedYears.length - 1] ?? null;
                    const v = activeStrategy.getTerminalMetricValue(terminalYear);
                    return v != null ? `₹${fmtNum(v)} Cr` : "—";
                  })(),
                },
                {
                  label: "Horizon",
                  value: activeEstimateYears
                    ? `${activeEstimateYears} yrs`
                    : company.investment_horizon_years
                      ? `${company.investment_horizon_years} yrs`
                      : "—",
                },
              ].map(({ label, value }) => (
                <div key={label} className="px-4 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold tabular-nums mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Valuation Scenarios */}
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Valuation Scenarios
            </h3>
            <ValuationScenarios
              strategy={activeStrategy}
              scenarioData={activeMs.scenarioData}
              storedDerivedScenarios={activeMs.storedDerivedScenarios}
              financialYears={activeComputedYears}
              company={{
                market_cap: marketCapInCrores(company.indian_stocks?.market_cap),
                current_price: company.indian_stocks?.price ?? null,
                expected_returns: company.expected_returns,
                investment_horizon_years: activeEstimateYears || company.investment_horizon_years,
              }}
              expReturns={activeMs.expReturns}
              onScenarioChange={(type, key, value) => handleScenarioChange(activeMs.model.id, type, key, value)}
            />
          </div>
        </div>
      )}

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
