# Multi-Projection & Valuation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add EV/EBITDA projection and valuation support alongside existing PE/Earnings, with extensible Strategy pattern, multiple models per company, default model selection, and accordion UI.

**Architecture:** Polymorphic tables with `projection_models` parent, Strategy pattern for type-specific computation logic, registry for extensibility, combined Projections & Valuations tab with accordion layout.

**Tech Stack:** Next.js 15, Supabase PostgreSQL, TypeScript, shadcn/ui, Tailwind CSS v4

**Design Doc:** `docs/plans/2026-06-20-multi-projection-valuation-design.md`

---

## Task 1: Database Migration — Create `projection_models` table and alter existing tables

**Files:**
- Create: `supabase/migrations/002_projection_models.sql`

**Step 1: Write the migration SQL**

```sql
-- ============================================================
-- Migration 002: Multi-projection model support
-- ============================================================

-- 1. Create projection_models table
CREATE TABLE projection_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  projection_type TEXT NOT NULL CHECK (projection_type IN ('pe_earnings', 'ev_ebitda')),
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, projection_type)
);

ALTER TABLE projection_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own projection models"
  ON projection_models FOR ALL USING (auth.uid() = user_id);

-- Partial unique index: only one default per company
CREATE UNIQUE INDEX idx_one_default_projection
  ON projection_models(company_id) WHERE is_default = true;

CREATE INDEX idx_projection_models_company ON projection_models(company_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON projection_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Alter financial_years: add projection_model_id and EV/EBITDA columns
ALTER TABLE financial_years
  ADD COLUMN projection_model_id UUID REFERENCES projection_models(id) ON DELETE CASCADE,
  ADD COLUMN net_debt NUMERIC,
  ADD COLUMN lease_liability NUMERIC,
  ADD COLUMN total_debt NUMERIC,
  ADD COLUMN ev_ebitda_ratio NUMERIC;

-- Drop old unique constraint, add new one
ALTER TABLE financial_years DROP CONSTRAINT financial_years_company_id_year_key;
ALTER TABLE financial_years ADD CONSTRAINT financial_years_projection_model_year_key
  UNIQUE(projection_model_id, year);

CREATE INDEX idx_financial_years_projection_model ON financial_years(projection_model_id);

-- 3. Alter valuation_scenarios: add projection_model_id and EV/EBITDA columns
ALTER TABLE valuation_scenarios
  ADD COLUMN projection_model_id UUID REFERENCES projection_models(id) ON DELETE CASCADE,
  ADD COLUMN target_ev_ebitda_ratio NUMERIC,
  ADD COLUMN expected_ev NUMERIC,
  ADD COLUMN net_debt_terminal NUMERIC;

-- Drop old unique constraint, add new one
ALTER TABLE valuation_scenarios DROP CONSTRAINT valuation_scenarios_company_id_scenario_type_key;
ALTER TABLE valuation_scenarios ADD CONSTRAINT valuation_scenarios_projection_model_scenario_key
  UNIQUE(projection_model_id, scenario_type);

CREATE INDEX idx_valuation_scenarios_projection_model ON valuation_scenarios(projection_model_id);

-- 4. Migrate existing data: create a pe_earnings projection_model for each company
--    that already has financial_years or valuation_scenarios
INSERT INTO projection_models (company_id, user_id, projection_type, name, is_default, sort_order)
SELECT DISTINCT c.id, c.user_id, 'pe_earnings', 'PE / Earnings', true, 0
FROM companies c
WHERE EXISTS (SELECT 1 FROM financial_years fy WHERE fy.company_id = c.id)
   OR EXISTS (SELECT 1 FROM valuation_scenarios vs WHERE vs.company_id = c.id);

-- Link existing financial_years to their projection_model
UPDATE financial_years fy
SET projection_model_id = pm.id
FROM projection_models pm
WHERE pm.company_id = fy.company_id AND pm.projection_type = 'pe_earnings';

-- Link existing valuation_scenarios to their projection_model
UPDATE valuation_scenarios vs
SET projection_model_id = pm.id
FROM projection_models pm
WHERE pm.company_id = vs.company_id AND pm.projection_type = 'pe_earnings';
```

**Step 2: Apply the migration to Supabase**

Run: `npx supabase db push` or apply via Supabase dashboard SQL editor.

**Step 3: Commit**

```bash
git add supabase/migrations/002_projection_models.sql
git commit -m "feat: add projection_models table and migrate existing data"
```

---

## Task 2: TypeScript Types — Add `ProjectionModel` type and update existing types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Add ProjectionModel interface and update FinancialYear/ValuationScenario**

Add the `ProjectionModel` interface and the `ProjectionType` type. Add new fields to `FinancialYear` and `ValuationScenario`.

```typescript
// Add at top of file, before existing interfaces:
export type ProjectionType = 'pe_earnings' | 'ev_ebitda';

// Add new interface after Company:
export interface ProjectionModel {
  id: string;
  company_id: string;
  user_id: string;
  projection_type: ProjectionType;
  name: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Nested data (populated by Supabase joins)
  financial_years?: FinancialYear[];
  valuation_scenarios?: ValuationScenario[];
}

// In FinancialYear interface, add after company_id:
//   projection_model_id: string | null;
//   net_debt: number | null;
//   lease_liability: number | null;
//   total_debt: number | null;
//   ev_ebitda_ratio: number | null;

// In ValuationScenario interface, add after company_id:
//   projection_model_id: string | null;
//   target_ev_ebitda_ratio: number | null;
//   expected_ev: number | null;
//   net_debt_terminal: number | null;
```

**Step 2: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add ProjectionModel type and extend FinancialYear/ValuationScenario"
```

---

## Task 3: Strategy Pattern — Create projection strategy interfaces and registry

**Files:**
- Create: `src/lib/projections/types.ts`
- Create: `src/lib/projections/pe-earnings-strategy.ts`
- Create: `src/lib/projections/ev-ebitda-strategy.ts`
- Create: `src/lib/projections/registry.ts`

**Step 1: Create the strategy types file**

Create `src/lib/projections/types.ts`:

```typescript
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
  locked?: boolean;       // auto-computed, cannot be edited at all
  overridable?: boolean;  // auto-computed but user CAN override (shown in purple)
}

export interface ValuationFieldConfig {
  key: string;
  label: string;
  isInput: boolean;  // true = user types, false = computed display
}

export interface ProjectionStrategy {
  type: ProjectionType;
  label: string;
  rowConfigs: RowConfig[];

  /** Multi-pass field computation for the projection grid */
  computeFields(
    years: FinancialYear[],
    overrides: Set<string>,
    marketCap?: number | null
  ): FinancialYear[];

  /** Valuation field definitions for the scenario table */
  getValuationFields(): ValuationFieldConfig[];

  /** Compute derived valuation values for a single scenario */
  computeValuationDerived(
    scenarioInputs: Record<string, number | null>,
    terminalYear: FinancialYear | null,
    company: { market_cap: number | null; current_price: number | null; expected_returns: number | null; investment_horizon_years: number | null }
  ): Record<string, number | null>;

  /** Label for the terminal metric shown in valuation info row */
  getTerminalMetricLabel(): string;

  /** Extract the terminal metric value from the last financial year */
  getTerminalMetricValue(terminalYear: FinancialYear | null): number | null;
}
```

**Step 2: Create PE/Earnings strategy**

Create `src/lib/projections/pe-earnings-strategy.ts`:

```typescript
import type { FinancialYear } from "@/types/database";
import type { ProjectionStrategy, RowConfig, ValuationFieldConfig } from "./types";

function round(val: number | null | undefined, decimals = 1): number | null {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * 10 ** decimals) / 10 ** decimals;
}

function oKey(field: string, yearIdx: number) {
  return `${field}-${yearIdx}`;
}

const ROW_CONFIGS: RowConfig[] = [
  { key: "revenue", label: "Revenue", type: "required", format: "number", section: "header" },
  { key: "revenue_growth_pct", label: "Revenue Growth %", type: "auto", format: "percent", locked: true },
  { key: "ebitda_margin_pct", label: "EBITDA Margin %", type: "required", format: "percent" },
  { key: "ebitda", label: "EBITDA", type: "auto", format: "number", section: "subtotal", dividerAbove: true },
  { key: "ebitda_growth_pct", label: "EBITDA Growth %", type: "auto", format: "percent", locked: true },
  { key: "depreciation", label: "Depreciation", type: "required", format: "number", dividerAbove: true },
  { key: "finance_cost", label: "Interest", type: "required", format: "number" },
  { key: "other_income", label: "Other Income", type: "required", format: "number" },
  { key: "exceptional_items", label: "Exceptional Items", type: "input", format: "number" },
  { key: "pbt", label: "Profit before tax", type: "auto", format: "number", section: "subtotal", dividerAbove: true },
  { key: "tax_pct", label: "Tax %", type: "required", format: "percent" },
  { key: "pat", label: "PAT", type: "auto", format: "number", section: "total" },
  { key: "pat_growth_pct", label: "PAT Growth %", type: "auto", format: "percent", locked: true },
  { key: "pat_margin_pct", label: "PAT Margin %", type: "auto", format: "percent", locked: true },
  { key: "pe", label: "PE", type: "auto", format: "ratio", dividerAbove: true, locked: true },
  { key: "peg", label: "PEG", type: "auto", format: "ratio", locked: true },
];

export class PeEarningsStrategy implements ProjectionStrategy {
  type = "pe_earnings" as const;
  label = "PE / Earnings";
  rowConfigs = ROW_CONFIGS;

  computeFields(
    data: FinancialYear[],
    overrides: Set<string>,
    marketCap?: number | null
  ): FinancialYear[] {
    // Pass 1: EBITDA and revenue growth
    const pass1 = data.map((fy, idx) => {
      const prev = idx > 0 ? data[idx - 1] : null;
      const c = { ...fy };
      if (!overrides.has(oKey("ebitda", idx))) {
        c.ebitda = c.revenue != null && c.ebitda_margin_pct != null
          ? round(c.revenue * c.ebitda_margin_pct / 100) : null;
      }
      if (!overrides.has(oKey("revenue_growth_pct", idx))) {
        c.revenue_growth_pct = c.revenue != null && prev?.revenue != null && prev.revenue !== 0
          ? round((c.revenue - prev.revenue) / prev.revenue * 100) : null;
      }
      return c;
    });

    // Pass 2: EBITDA growth, PBT, PAT
    const pass2 = pass1.map((fy, idx) => {
      const prev = idx > 0 ? pass1[idx - 1] : null;
      const c = { ...fy };
      if (!overrides.has(oKey("ebitda_growth_pct", idx))) {
        c.ebitda_growth_pct = c.ebitda != null && prev?.ebitda != null && prev.ebitda !== 0
          ? round((c.ebitda - prev.ebitda) / prev.ebitda * 100) : null;
      }
      if (!overrides.has(oKey("pbt", idx))) {
        c.pbt = c.ebitda != null
          ? round(c.ebitda - (c.depreciation ?? 0) - (c.finance_cost ?? 0) + (c.other_income ?? 0) + (c.exceptional_items ?? 0))
          : null;
      }
      if (!overrides.has(oKey("pat", idx))) {
        c.pat = c.pbt != null && c.tax_pct != null
          ? round(c.pbt * (1 - c.tax_pct / 100)) : null;
      }
      return c;
    });

    // Pass 3: PAT growth, PAT margin, PE, PEG
    return pass2.map((fy, idx) => {
      const prev = idx > 0 ? pass2[idx - 1] : null;
      const c = { ...fy };
      if (!overrides.has(oKey("pat_growth_pct", idx))) {
        c.pat_growth_pct = c.pat != null && prev?.pat != null && prev.pat !== 0
          ? round((c.pat - prev.pat) / prev.pat * 100) : null;
      }
      if (!overrides.has(oKey("pat_margin_pct", idx))) {
        c.pat_margin_pct = c.pat != null && c.revenue != null && c.revenue !== 0
          ? round(c.pat / c.revenue * 100) : null;
      }
      if (!overrides.has(oKey("pe", idx))) {
        c.pe = marketCap != null && c.pat != null && c.pat !== 0
          ? round(marketCap / c.pat, 1) : null;
      }
      if (!overrides.has(oKey("peg", idx))) {
        c.peg = c.pe != null && c.pat_growth_pct != null && c.pat_growth_pct !== 0
          ? round(c.pe / c.pat_growth_pct, 2) : null;
      }
      return c;
    });
  }

  getValuationFields(): ValuationFieldConfig[] {
    return [
      { key: "target_pe", label: "P/E Ratio", isInput: true },
      { key: "target_market_cap", label: "Market Cap", isInput: false },
      { key: "irr", label: "IRR", isInput: false },
      { key: "buying_market_cap", label: "Buying MC", isInput: false },
      { key: "buy_price", label: "Buy Price", isInput: false },
    ];
  }

  computeValuationDerived(
    inputs: Record<string, number | null>,
    terminalYear: FinancialYear | null,
    company: { market_cap: number | null; current_price: number | null; expected_returns: number | null; investment_horizon_years: number | null }
  ): Record<string, number | null> {
    const targetPE = inputs.target_pe;
    const terminalPAT = terminalYear?.pat ?? null;
    const curMC = company.market_cap ?? 0;
    const curPrice = company.current_price ?? 0;
    const horizon = company.investment_horizon_years ?? 2;
    const expReturns = company.expected_returns ?? 0.25;

    // Target Market Cap = PE x Terminal PAT (or manual if no PAT)
    let targetMC = inputs.target_market_cap ?? null;
    if (targetPE != null && terminalPAT != null) {
      targetMC = round(targetPE * terminalPAT, 2);
    }

    let irr: number | null = null;
    let buyingMC: number | null = null;
    let buyPrice: number | null = null;

    if (targetMC != null && curMC > 0 && horizon > 0) {
      irr = Math.pow(targetMC / curMC, 1 / horizon) - 1;
      buyingMC = targetMC / Math.pow(1 + expReturns, horizon);
      buyPrice = curPrice > 0 && curMC > 0 ? buyingMC * (curPrice / curMC) : null;
    }

    return {
      target_pe: targetPE,
      target_market_cap: targetMC,
      irr: irr != null ? round(irr, 4) : null,
      buying_market_cap: buyingMC != null ? round(buyingMC, 2) : null,
      buy_price: buyPrice != null ? round(buyPrice, 2) : null,
    };
  }

  getTerminalMetricLabel(): string {
    return "Terminal PAT";
  }

  getTerminalMetricValue(terminalYear: FinancialYear | null): number | null {
    return terminalYear?.pat ?? null;
  }
}
```

**Step 3: Create EV/EBITDA strategy**

Create `src/lib/projections/ev-ebitda-strategy.ts`:

```typescript
import type { FinancialYear } from "@/types/database";
import type { ProjectionStrategy, RowConfig, ValuationFieldConfig } from "./types";

function round(val: number | null | undefined, decimals = 1): number | null {
  if (val == null || !isFinite(val)) return null;
  return Math.round(val * 10 ** decimals) / 10 ** decimals;
}

function oKey(field: string, yearIdx: number) {
  return `${field}-${yearIdx}`;
}

const ROW_CONFIGS: RowConfig[] = [
  { key: "revenue", label: "Revenue", type: "required", format: "number", section: "header" },
  { key: "revenue_growth_pct", label: "Revenue Growth %", type: "auto", format: "percent", locked: true },
  { key: "ebitda_margin_pct", label: "EBITDA Margins %", type: "required", format: "percent" },
  { key: "ebitda", label: "EBITDA", type: "auto", format: "number", section: "subtotal", dividerAbove: true },
  { key: "ebitda_growth_pct", label: "EBITDA Growth %", type: "auto", format: "percent", locked: true },
  { key: "net_debt", label: "Net Debt", type: "input", format: "number", dividerAbove: true },
  { key: "lease_liability", label: "Lease Liability", type: "input", format: "number" },
  { key: "total_debt", label: "Total Debt", type: "auto", format: "number", section: "subtotal", overridable: true },
  { key: "ev_ebitda_ratio", label: "EV/EBITDA", type: "auto", format: "ratio", dividerAbove: true, overridable: true },
];

export class EvEbitdaStrategy implements ProjectionStrategy {
  type = "ev_ebitda" as const;
  label = "EV / EBITDA";
  rowConfigs = ROW_CONFIGS;

  computeFields(
    data: FinancialYear[],
    overrides: Set<string>,
    marketCap?: number | null
  ): FinancialYear[] {
    // Pass 1: EBITDA and revenue growth
    const pass1 = data.map((fy, idx) => {
      const prev = idx > 0 ? data[idx - 1] : null;
      const c = { ...fy };
      if (!overrides.has(oKey("ebitda", idx))) {
        c.ebitda = c.revenue != null && c.ebitda_margin_pct != null
          ? round(c.revenue * c.ebitda_margin_pct / 100) : null;
      }
      if (!overrides.has(oKey("revenue_growth_pct", idx))) {
        c.revenue_growth_pct = c.revenue != null && prev?.revenue != null && prev.revenue !== 0
          ? round((c.revenue - prev.revenue) / prev.revenue * 100) : null;
      }
      return c;
    });

    // Pass 2: EBITDA growth, Total Debt, EV/EBITDA
    return pass1.map((fy, idx) => {
      const prev = idx > 0 ? pass1[idx - 1] : null;
      const c = { ...fy };

      if (!overrides.has(oKey("ebitda_growth_pct", idx))) {
        c.ebitda_growth_pct = c.ebitda != null && prev?.ebitda != null && prev.ebitda !== 0
          ? round((c.ebitda - prev.ebitda) / prev.ebitda * 100) : null;
      }

      // Total Debt = Net Debt + Lease Liability (overridable)
      if (!overrides.has(oKey("total_debt", idx))) {
        c.total_debt = round((c.net_debt ?? 0) + (c.lease_liability ?? 0));
      }

      // EV/EBITDA = (Market Cap + Total Debt) / EBITDA (overridable)
      if (!overrides.has(oKey("ev_ebitda_ratio", idx))) {
        const totalDebt = c.total_debt ?? 0;
        c.ev_ebitda_ratio = marketCap != null && c.ebitda != null && c.ebitda !== 0
          ? round((marketCap + totalDebt) / c.ebitda, 2) : null;
      }

      return c;
    });
  }

  getValuationFields(): ValuationFieldConfig[] {
    return [
      { key: "target_ev_ebitda_ratio", label: "EV/EBITDA Ratio", isInput: true },
      { key: "expected_ev", label: "Expected EV", isInput: false },
      { key: "net_debt_terminal", label: "Net Debt (Terminal)", isInput: false },
      { key: "target_market_cap", label: "Market Cap", isInput: false },
      { key: "irr", label: "IRR", isInput: false },
      { key: "buying_market_cap", label: "Buying MC", isInput: false },
      { key: "buy_price", label: "Buy Price", isInput: false },
    ];
  }

  computeValuationDerived(
    inputs: Record<string, number | null>,
    terminalYear: FinancialYear | null,
    company: { market_cap: number | null; current_price: number | null; expected_returns: number | null; investment_horizon_years: number | null }
  ): Record<string, number | null> {
    const targetRatio = inputs.target_ev_ebitda_ratio;
    const terminalEBITDA = terminalYear?.ebitda ?? null;
    const netDebtTerminal = terminalYear?.net_debt ?? null;
    const curMC = company.market_cap ?? 0;
    const curPrice = company.current_price ?? 0;
    const horizon = company.investment_horizon_years ?? 2;
    const expReturns = company.expected_returns ?? 0.25;

    // Expected EV = Target EV/EBITDA Ratio x Terminal EBITDA
    let expectedEV: number | null = null;
    if (targetRatio != null && terminalEBITDA != null) {
      expectedEV = round(targetRatio * terminalEBITDA, 2);
    }

    // Market Cap = Expected EV - Net Debt at terminal year
    let targetMC: number | null = null;
    if (expectedEV != null) {
      targetMC = round(expectedEV - (netDebtTerminal ?? 0), 2);
    }

    let irr: number | null = null;
    let buyingMC: number | null = null;
    let buyPrice: number | null = null;

    if (targetMC != null && curMC > 0 && horizon > 0) {
      irr = Math.pow(targetMC / curMC, 1 / horizon) - 1;
      buyingMC = targetMC / Math.pow(1 + expReturns, horizon);
      buyPrice = curPrice > 0 && curMC > 0 ? buyingMC * (curPrice / curMC) : null;
    }

    return {
      target_ev_ebitda_ratio: targetRatio,
      expected_ev: expectedEV,
      net_debt_terminal: netDebtTerminal,
      target_market_cap: targetMC,
      irr: irr != null ? round(irr, 4) : null,
      buying_market_cap: buyingMC != null ? round(buyingMC, 2) : null,
      buy_price: buyPrice != null ? round(buyPrice, 2) : null,
    };
  }

  getTerminalMetricLabel(): string {
    return "Terminal EBITDA";
  }

  getTerminalMetricValue(terminalYear: FinancialYear | null): number | null {
    return terminalYear?.ebitda ?? null;
  }
}
```

**Step 4: Create the registry**

Create `src/lib/projections/registry.ts`:

```typescript
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
```

**Step 5: Commit**

```bash
git add src/lib/projections/
git commit -m "feat: add projection strategy pattern with PE/Earnings and EV/EBITDA strategies"
```

---

## Task 4: Server Actions — Projection model CRUD and bulk save

**Files:**
- Create: `src/app/(authenticated)/actions/projection-actions.ts`
- Modify: `src/app/(authenticated)/actions/financial-actions.ts`

**Step 1: Create projection actions**

Create `src/app/(authenticated)/actions/projection-actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProjectionType } from "@/types/database";

export async function createProjectionModel(
  companyId: string,
  projectionType: ProjectionType,
  name: string,
  isDefault: boolean
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // If this is the default, unset any existing default first
  if (isDefault) {
    await supabase
      .from("projection_models")
      .update({ is_default: false })
      .eq("company_id", companyId)
      .eq("is_default", true);
  }

  const { data, error } = await supabase
    .from("projection_models")
    .insert({
      company_id: companyId,
      user_id: user.id,
      projection_type: projectionType,
      name,
      is_default: isDefault,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
  return data;
}

export async function deleteProjectionModel(
  projectionModelId: string,
  companyId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Prevent deleting the default model
  const { data: model } = await supabase
    .from("projection_models")
    .select("is_default")
    .eq("id", projectionModelId)
    .single();

  if (model?.is_default) {
    throw new Error("Cannot delete the default projection model. Set another as default first.");
  }

  const { error } = await supabase
    .from("projection_models")
    .delete()
    .eq("id", projectionModelId);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function setDefaultProjectionModel(
  companyId: string,
  projectionModelId: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Unset current default
  await supabase
    .from("projection_models")
    .update({ is_default: false })
    .eq("company_id", companyId)
    .eq("is_default", true);

  // Set new default
  const { error } = await supabase
    .from("projection_models")
    .update({ is_default: true })
    .eq("id", projectionModelId);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
  revalidatePath("/");
}

export async function saveAllProjections(
  companyId: string,
  models: Array<{
    projection_model_id: string;
    financial_years: Array<Record<string, unknown>>;
    valuation_scenarios: Array<Record<string, unknown>>;
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  for (const model of models) {
    // Upsert financial years
    if (model.financial_years.length > 0) {
      const rows = model.financial_years.map((fy) => ({
        ...fy,
        company_id: companyId,
        user_id: user.id,
        projection_model_id: model.projection_model_id,
      }));

      const { error: fyError } = await supabase
        .from("financial_years")
        .upsert(rows, { onConflict: "projection_model_id,year" });

      if (fyError) throw new Error(`Financial years error: ${fyError.message}`);
    }

    // Upsert valuation scenarios
    if (model.valuation_scenarios.length > 0) {
      const scenarios = model.valuation_scenarios.map((vs) => ({
        ...vs,
        company_id: companyId,
        user_id: user.id,
        projection_model_id: model.projection_model_id,
      }));

      const { error: vsError } = await supabase
        .from("valuation_scenarios")
        .upsert(scenarios, { onConflict: "projection_model_id,scenario_type" });

      if (vsError) throw new Error(`Valuation scenarios error: ${vsError.message}`);
    }
  }

  // Update investment_horizon_years from the default model's estimate count
  const { data: defaultModel } = await supabase
    .from("projection_models")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .single();

  if (defaultModel) {
    const { count } = await supabase
      .from("financial_years")
      .select("id", { count: "exact", head: true })
      .eq("projection_model_id", defaultModel.id)
      .eq("is_estimate", true);

    await supabase
      .from("companies")
      .update({ investment_horizon_years: count ?? 0 })
      .eq("id", companyId);
  }

  revalidatePath(`/company/${companyId}`);
  revalidatePath("/");
}
```

**Step 2: Commit**

```bash
git add src/app/(authenticated)/actions/projection-actions.ts
git commit -m "feat: add projection model CRUD and bulk save actions"
```

---

## Task 5: Update Data Fetching — Fetch projection_models with nested data

**Files:**
- Modify: `src/app/(authenticated)/company/[id]/page.tsx`
- Modify: `src/app/(authenticated)/actions/company-actions.ts`
- Modify: `src/app/(authenticated)/page.tsx`

**Step 1: Update the company detail page to fetch projection_models**

In `src/app/(authenticated)/company/[id]/page.tsx`, change the Supabase query to include `projection_models` with nested `financial_years` and `valuation_scenarios`:

```typescript
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select(`
      *,
      projection_models(
        *,
        financial_years(*),
        valuation_scenarios(*)
      ),
      timeline_entries(*),
      segment_valuations(*),
      market_perceptions(*)
    `)
    .eq("id", id)
    .single();

  if (error || !company) notFound();

  // Sort projection models by sort_order, then sort their financial_years
  const projectionModels = (company.projection_models ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pm: any) => ({
      ...pm,
      financial_years: (pm.financial_years ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

  const timelineEntries = company.timeline_entries ?? [];

  // Get default model's valuation scenarios for header
  const defaultModel = projectionModels.find((pm: any) => pm.is_default);
  const defaultScenarios = defaultModel?.valuation_scenarios ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyHeader company={company} scenarios={defaultScenarios} />
      <CompanyTabs
        company={company}
        projectionModels={projectionModels}
        timelineEntries={timelineEntries}
      />
    </div>
  );
}
```

**Step 2: Update `getCompany` action to include projection_models**

In `src/app/(authenticated)/actions/company-actions.ts`, update the `getCompany` query:

Change the select in `getCompany()` from:
```
*, valuation_scenarios(*), financial_years(*), timeline_entries(*), ...
```
to:
```
*, projection_models(*, financial_years(*), valuation_scenarios(*)), timeline_entries(*), segment_valuations(*), market_perceptions(*)
```

Also update `getCompanies()` to fetch default model scenarios for dashboard:
```
*, projection_models(*, valuation_scenarios(*))
```

**Step 3: Update dashboard page query**

In `src/app/(authenticated)/page.tsx`, update the query:

```typescript
const { data: companies } = await supabase
  .from("companies")
  .select("*, projection_models(*, valuation_scenarios(*))")
  .order("name");
```

**Step 4: Commit**

```bash
git add src/app/(authenticated)/company/[id]/page.tsx src/app/(authenticated)/actions/company-actions.ts src/app/(authenticated)/page.tsx
git commit -m "feat: update data fetching to use projection_models with nested data"
```

---

## Task 6: Utility Updates — Update calculations to work with projection models

**Files:**
- Modify: `src/lib/utils/calculations.ts`

**Step 1: Update `effectiveBuyPrice` and `getBaseCaseBuyPrice` to work with projection models**

Add helpers that extract scenarios from the default projection model:

```typescript
// Add to calculations.ts:

import type { ProjectionModel } from "@/types/database";

/** Get default model's base case buy price from projection models */
export function getDefaultModelBuyPrice(
  projectionModels: ProjectionModel[]
): number | null {
  const defaultModel = projectionModels.find((pm) => pm.is_default);
  if (!defaultModel?.valuation_scenarios) return null;
  return getBaseCaseBuyPrice(defaultModel.valuation_scenarios);
}

/** Get default model's base case IRR from projection models */
export function getDefaultModelIRR(
  projectionModels: ProjectionModel[]
): number | null {
  const defaultModel = projectionModels.find((pm) => pm.is_default);
  if (!defaultModel?.valuation_scenarios) return null;
  const base = defaultModel.valuation_scenarios.find((s) => s.scenario_type === "base");
  return base?.irr ?? null;
}
```

**Step 2: Commit**

```bash
git add src/lib/utils/calculations.ts
git commit -m "feat: add projection model utility functions for default model metrics"
```

---

## Task 7: UI — Create the ProjectionGrid component (strategy-driven)

**Files:**
- Create: `src/components/company/projection-grid.tsx`

**Step 1: Create the generic, strategy-driven projection grid**

This is extracted from the existing `FinancialModelTab` but driven by `strategy.rowConfigs` instead of hardcoded `ROWS`. The component receives data, overrides, and callbacks — it does NOT own state.

Create `src/components/company/projection-grid.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { handleGridKeyDown } from "@/lib/grid-keyboard-nav";
import type { FinancialYear } from "@/types/database";
import type { RowConfig } from "@/lib/projections/types";

function fmt(val: number | null | undefined, format: RowConfig["format"]): string {
  if (val == null) return "";
  if (format === "percent") {
    return `${Math.round(val)}%`;
  }
  if (format === "number") {
    return val.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  // ratio — show 2 decimals
  return val.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function isEstimate(yearStr: string): boolean {
  return yearStr.endsWith("E");
}

function oKey(field: string, yearIdx: number) {
  return `${field}-${yearIdx}`;
}

export function ProjectionGrid({
  data,
  rowConfigs,
  overrides,
  onCellChange,
  onYearChange,
  onAddYear,
  onRemoveYear,
}: {
  data: FinancialYear[];
  rowConfigs: RowConfig[];
  overrides: Set<string>;
  onCellChange: (yearIdx: number, key: string, value: string) => void;
  onYearChange: (idx: number, value: string) => void;
  onAddYear: () => void;
  onRemoveYear: (idx: number) => void;
}) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);

  const AUTO_KEYS = new Set(
    rowConfigs.filter((r) => r.type === "auto").map((r) => r.key)
  );

  const cellId = (key: string, idx: number) => `${key}-${idx}`;

  return (
    <div>
      {/* Add year button */}
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onAddYear}
          className="h-7 px-2.5 text-xs gap-1 rounded-full"
        >
          <Plus className="h-3 w-3" /> Add Year
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-border/40">
              <th className="sticky left-0 z-30 bg-background py-3 pl-5 pr-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[180px]">
                &nbsp;
              </th>
              {data.map((fy, idx) => {
                const isEst = isEstimate(fy.year);
                const isEditingH = editingHeader === idx;
                return (
                  <th
                    key={idx}
                    className={`group py-3 px-3 text-right text-xs font-semibold tracking-wide min-w-[100px] ${
                      isEst
                        ? "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                        : "text-muted-foreground bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      {isEditingH ? (
                        <input
                          type="text"
                          className="w-20 h-6 text-right text-xs font-semibold bg-white dark:bg-slate-900 border border-blue-400/50 rounded px-1 outline-none focus:ring-1 focus:ring-blue-400/50"
                          defaultValue={fy.year}
                          autoFocus
                          onBlur={(e) => {
                            onYearChange(idx, e.target.value);
                            setEditingHeader(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onYearChange(idx, (e.target as HTMLInputElement).value);
                              setEditingHeader(null);
                            } else if (e.key === "Escape") {
                              setEditingHeader(null);
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="cursor-text hover:underline decoration-dashed underline-offset-2"
                          onClick={() => setEditingHeader(idx)}
                          title="Click to edit"
                        >
                          {fy.year.replace("FY", "Mar 20")}
                        </span>
                      )}
                      {data.length > 1 && !isEditingH && (
                        <button
                          onClick={() => onRemoveYear(idx)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-opacity"
                          title={`Remove ${fy.year}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rowConfigs.map((row, rowIndex) => {
              const isAuto = row.type === "auto";
              const isPct = row.format === "percent";
              const isHighlight = row.section === "subtotal" || row.section === "total";
              const isHeader = row.section === "header";

              return (
                <tr
                  key={row.key}
                  className={[
                    "group/row transition-colors",
                    row.dividerAbove ? "border-t border-border/40" : "",
                    isHighlight
                      ? "bg-muted/40 dark:bg-muted/20 border-t border-border/30"
                      : "border-b border-border/10",
                    !isHighlight && !isPct ? "hover:bg-muted/20" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* Label */}
                  <td
                    className={`sticky left-0 z-10 py-2 pl-5 pr-3 whitespace-nowrap ${
                      isHighlight
                        ? "bg-muted/40 dark:bg-muted/20 font-bold text-foreground"
                        : isHeader
                        ? "bg-background font-semibold text-foreground"
                        : isPct
                        ? "bg-background text-muted-foreground text-xs pl-8"
                        : "bg-background text-foreground/80"
                    }`}
                  >
                    {row.label}
                  </td>

                  {/* Values */}
                  {data.map((fy, idx) => {
                    const val = fy[row.key as keyof FinancialYear] as number | null;
                    const isOverridden = isAuto && overrides.has(oKey(row.key, idx));
                    const isEst = isEstimate(fy.year);
                    const cid = cellId(row.key, idx);
                    const isEditing = editingCell === cid;
                    const isGrowth = row.key.includes("growth");
                    const canEdit = (!isAuto || row.overridable || isEditing || isOverridden) && !row.locked;

                    const estBg = isEst ? "bg-blue-50/30 dark:bg-blue-950/10" : "";
                    const highlightBg = isHighlight
                      ? isEst
                        ? "bg-blue-50/50 dark:bg-blue-950/15"
                        : "bg-muted/40 dark:bg-muted/20"
                      : "";

                    if (canEdit) {
                      return (
                        <td key={fy.year} className={`py-1 px-1 ${highlightBg || estBg}`}>
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="any"
                              data-row={rowIndex}
                              data-col={idx}
                              className={`w-full h-8 text-right text-sm tabular-nums rounded outline-none transition-all ${
                                val == null || val === 0
                                  ? "bg-muted/30 border border-dashed border-border/60 hover:border-border hover:bg-muted/50"
                                  : "border border-transparent bg-transparent hover:bg-muted/30"
                              } focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/50 ${
                                isOverridden
                                  ? "text-violet-600 dark:text-violet-400"
                                  : ""
                              } ${isHighlight ? "font-bold" : ""} ${
                                isPct ? "text-xs text-muted-foreground pr-4 px-1" : "px-2"
                              }`}
                              value={val ?? ""}
                              onChange={(e) => onCellChange(idx, row.key, e.target.value)}
                              onBlur={() => {
                                if (isAuto && !isOverridden) setEditingCell(null);
                              }}
                              onKeyDown={handleGridKeyDown}
                              placeholder=""
                              autoFocus={isEditing}
                            />
                            {isPct && val != null && (
                              <span className="absolute right-1 text-xs text-muted-foreground pointer-events-none">%</span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // Auto-computed display cell
                    const growthColor =
                      isGrowth && val != null
                        ? val > 0 ? "text-emerald-600 dark:text-emerald-400"
                          : val < 0 ? "text-red-500 dark:text-red-400" : ""
                        : "";
                    const negativeColor =
                      !isGrowth && !isPct && val != null && val < 0
                        ? "text-red-500 dark:text-red-400" : "";

                    return (
                      <td
                        key={fy.year}
                        className={`py-2 px-3 text-right ${row.locked ? "" : "cursor-text"} ${highlightBg || estBg}`}
                        onClick={row.locked ? undefined : () => setEditingCell(cid)}
                      >
                        <span
                          className={`text-sm tabular-nums ${
                            isHighlight ? "font-bold text-foreground"
                              : isPct ? "text-xs text-muted-foreground"
                              : growthColor || negativeColor || "text-foreground/80"
                          }`}
                        >
                          {fmt(val, row.format) || (
                            <span className="text-muted-foreground/25">&mdash;</span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground px-1">
        <span>Click any auto-calculated cell to override</span>
        <span className="text-violet-500">Purple = manually overridden</span>
        <span className="text-blue-500">Blue columns = estimates</span>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/projection-grid.tsx
git commit -m "feat: create generic strategy-driven ProjectionGrid component"
```

---

## Task 8: UI — Create the ValuationScenarios component (strategy-driven)

**Files:**
- Create: `src/components/company/valuation-scenarios.tsx`

**Step 1: Create the generic valuation scenarios component**

This replaces the hardcoded ValuationTab. It's driven by `strategy.getValuationFields()` and `strategy.computeValuationDerived()`.

Create `src/components/company/valuation-scenarios.tsx`:

```typescript
"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { handleGridKeyDown } from "@/lib/grid-keyboard-nav";
import { fmtNum, fmtPct, fmtPriceShort } from "@/lib/utils/calculations";
import type { FinancialYear, ValuationScenario } from "@/types/database";
import type { ProjectionStrategy } from "@/lib/projections/types";

type ScenarioType = "bull" | "base" | "bare";

const SCENARIO_LABELS: Record<ScenarioType, { label: string; color: string }> = {
  bull: { label: "Bull", color: "text-green-700 dark:text-green-400" },
  base: { label: "Base", color: "text-blue-700 dark:text-blue-400" },
  bare: { label: "Bare", color: "text-orange-700 dark:text-orange-400" },
};

function formatFieldValue(key: string, val: number | null): string {
  if (val == null) return "";
  if (key === "irr") return fmtPct(val);
  if (key === "buy_price") return fmtPriceShort(val);
  if (key.includes("market_cap") || key === "buying_market_cap" || key === "expected_ev") {
    return `₹${Math.round(val).toLocaleString("en-IN")}`;
  }
  if (key.includes("ratio") || key === "target_pe") {
    return val.toLocaleString("en-IN", { maximumFractionDigits: 1 });
  }
  return fmtNum(val);
}

export function ValuationScenarios({
  strategy,
  scenarioData,
  financialYears,
  company,
  expReturns,
  onExpReturnsChange,
  onScenarioChange,
}: {
  strategy: ProjectionStrategy;
  scenarioData: Record<ScenarioType, Record<string, number | null>>;
  financialYears: FinancialYear[];
  company: { market_cap: number | null; current_price: number | null; expected_returns: number | null; investment_horizon_years: number | null };
  expReturns: number;
  onExpReturnsChange: (val: number) => void;
  onScenarioChange: (type: ScenarioType, key: string, value: string) => void;
}) {
  const terminalYear = useMemo(() => {
    if (financialYears.length === 0) return null;
    return financialYears[financialYears.length - 1];
  }, [financialYears]);

  const terminalMetric = strategy.getTerminalMetricValue(terminalYear);
  const fields = strategy.getValuationFields();
  const horizon = company.investment_horizon_years ?? 2;
  const curMC = company.market_cap ?? 0;

  // Compute derived for each scenario
  const computedScenarios = useMemo(() => {
    const companyWithReturns = { ...company, expected_returns: expReturns / 100 };
    return {
      bull: strategy.computeValuationDerived(scenarioData.bull, terminalYear, companyWithReturns),
      base: strategy.computeValuationDerived(scenarioData.base, terminalYear, companyWithReturns),
      bare: strategy.computeValuationDerived(scenarioData.bare, terminalYear, companyWithReturns),
    };
  }, [scenarioData, terminalYear, company, expReturns, strategy]);

  return (
    <div className="space-y-4">
      {/* Info row */}
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
        {terminalMetric != null && (
          <div>
            <Label className="text-xs text-muted-foreground">{strategy.getTerminalMetricLabel()}</Label>
            <div className="text-sm font-semibold tabular-nums">
              ₹{fmtNum(terminalMetric)} Cr
            </div>
          </div>
        )}
        <div>
          <Label className="text-xs text-muted-foreground">Horizon</Label>
          <div className="text-sm font-semibold tabular-nums">{horizon} years</div>
        </div>
      </div>

      {/* Scenarios table */}
      <div className="rounded-md border border-border/50 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20"></TableHead>
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
              const computed = computedScenarios[type];
              const cfg = SCENARIO_LABELS[type];

              return (
                <TableRow key={type}>
                  <TableCell className={`font-semibold ${cfg.color}`}>
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
                            placeholder="—"
                            value={scenarioData[type][f.key] ?? ""}
                            onChange={(e) => onScenarioChange(type, f.key, e.target.value)}
                            onKeyDown={handleGridKeyDown}
                          />
                        </TableCell>
                      );
                    }

                    const val = computed[f.key] ?? null;
                    const isBoldField = f.key === "irr" || f.key === "buy_price";
                    return (
                      <TableCell
                        key={f.key}
                        className={`text-right text-sm tabular-nums ${isBoldField ? "font-medium" : ""}`}
                      >
                        {formatFieldValue(f.key, val) || "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/valuation-scenarios.tsx
git commit -m "feat: create generic strategy-driven ValuationScenarios component"
```

---

## Task 9: UI — Create the ProjectionsValuationTab (accordion layout, main orchestrator)

**Files:**
- Create: `src/components/company/projections-valuation-tab.tsx`

**Step 1: Create the main tab component**

This is the orchestrator that manages all projection models in an accordion layout with a global save button.

Create `src/components/company/projections-valuation-tab.tsx`:

```typescript
"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronRight, Plus, Save, Star, Trash2 } from "lucide-react";
import { ProjectionGrid } from "./projection-grid";
import { ValuationScenarios } from "./valuation-scenarios";
import { getStrategy } from "@/lib/projections/registry";
import { getAvailableTypesExcluding } from "@/lib/projections/registry";
import {
  createProjectionModel,
  deleteProjectionModel,
  saveAllProjections,
  setDefaultProjectionModel,
} from "@/app/(authenticated)/actions/projection-actions";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company, FinancialYear, ProjectionModel, ProjectionType } from "@/types/database";

type ScenarioType = "bull" | "base" | "bare";

const PCT_FIELDS = ["revenue_growth_pct", "ebitda_margin_pct", "ebitda_growth_pct", "tax_pct", "pat_growth_pct", "pat_margin_pct"] as const;

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

function generateDefaultYears(companyId: string, projectionModelId: string): FinancialYear[] {
  const currentFY = getCurrentFYNum();
  const prevFY = currentFY - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const fyNum = prevFY + i;
    const isEst = i > 0;
    return {
      id: crypto.randomUUID(), company_id: companyId, user_id: "",
      projection_model_id: projectionModelId,
      year: `FY${fyNum}${isEst ? "E" : ""}`, is_estimate: isEst, sort_order: i,
      revenue: null, revenue_growth_pct: null, ebitda: null, ebitda_margin_pct: null,
      ebitda_growth_pct: null, depreciation: null, finance_cost: null, other_income: null,
      exceptional_items: 0, pbt: null, tax_pct: 25, pat: null, pat_growth_pct: null,
      pat_margin_pct: null, minority_interest: null, pat_for_shareholders: null,
      pe: null, peg: null, net_debt: null, lease_liability: null, total_debt: null,
      ev_ebitda_ratio: null, created_at: "", updated_at: "",
    } as FinancialYear;
  });
}

interface ModelState {
  model: ProjectionModel;
  financialYears: FinancialYear[];
  overrides: Set<string>;
  scenarioData: Record<ScenarioType, Record<string, number | null>>;
  expReturns: number;
}

function initModelState(
  model: ProjectionModel,
  company: Company
): ModelState {
  const strategy = getStrategy(model.projection_type);
  const autoKeys = new Set(strategy.rowConfigs.filter((r) => r.type === "auto").map((r) => r.key));

  const years = model.financial_years && model.financial_years.length > 0
    ? normalizeFinancialYears(model.financial_years)
    : generateDefaultYears(company.id, model.id);

  const overrides = new Set<string>();
  (model.financial_years ?? []).forEach((fy, idx) => {
    autoKeys.forEach((key) => {
      if (fy[key as keyof FinancialYear] != null) overrides.add(`${key}-${idx}`);
    });
  });

  const scenarios = model.valuation_scenarios ?? [];
  const scenarioData: Record<ScenarioType, Record<string, number | null>> = {
    bull: {}, base: {}, bare: {},
  };
  for (const s of scenarios) {
    if (s.scenario_type in scenarioData) {
      const fields = strategy.getValuationFields();
      for (const f of fields) {
        if (f.isInput) {
          scenarioData[s.scenario_type as ScenarioType][f.key] =
            (s as Record<string, unknown>)[f.key] as number | null ?? null;
        }
      }
    }
  }

  return {
    model,
    financialYears: years,
    overrides,
    scenarioData,
    expReturns: company.expected_returns != null ? company.expected_returns * 100 : 25,
  };
}

export function ProjectionsValuationTab({
  company,
  projectionModels,
}: {
  company: Company;
  projectionModels: ProjectionModel[];
}) {
  const router = useRouter();
  const [modelStates, setModelStates] = useState<ModelState[]>(() =>
    projectionModels.map((pm) => initModelState(pm, company))
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const defaultId = projectionModels.find((pm) => pm.is_default)?.id;
    return new Set(defaultId ? [defaultId] : projectionModels.length > 0 ? [projectionModels[0].id] : []);
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const existingTypes = modelStates.map((ms) => ms.model.projection_type);
  const availableTypes = getAvailableTypesExcluding(existingTypes);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateModelState = useCallback((modelId: string, updater: (prev: ModelState) => ModelState) => {
    setModelStates((prev) => prev.map((ms) => ms.model.id === modelId ? updater(ms) : ms));
  }, []);

  // Cell change handler for a specific model
  const handleCellChange = useCallback((modelId: string, yearIdx: number, key: string, value: string) => {
    updateModelState(modelId, (ms) => {
      const strategy = getStrategy(ms.model.projection_type);
      const autoKeys = new Set(strategy.rowConfigs.filter((r) => r.type === "auto").map((r) => r.key));

      const newYears = [...ms.financialYears];
      newYears[yearIdx] = { ...newYears[yearIdx], [key]: value === "" ? null : Number(value) };

      let newOverrides = ms.overrides;
      if (autoKeys.has(key)) {
        newOverrides = new Set(ms.overrides);
        if (value === "") newOverrides.delete(`${key}-${yearIdx}`);
        else newOverrides.add(`${key}-${yearIdx}`);
      }

      return { ...ms, financialYears: newYears, overrides: newOverrides };
    });
  }, [updateModelState]);

  const handleYearChange = useCallback((modelId: string, idx: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    updateModelState(modelId, (ms) => {
      const newYears = [...ms.financialYears];
      newYears[idx] = { ...newYears[idx], year: trimmed, is_estimate: trimmed.endsWith("E") };
      return { ...ms, financialYears: newYears };
    });
  }, [updateModelState]);

  const handleAddYear = useCallback((modelId: string) => {
    updateModelState(modelId, (ms) => {
      const years = ms.financialYears;
      const lastYear = years[years.length - 1]?.year ?? "FY25";
      const match = lastYear.match(/FY(\d+)/);
      const nextNum = match ? parseInt(match[1]) + 1 : 26;
      const newYear: FinancialYear = {
        id: crypto.randomUUID(), company_id: company.id, user_id: "",
        projection_model_id: ms.model.id,
        year: `FY${nextNum}E`, is_estimate: true, sort_order: years.length,
        revenue: null, revenue_growth_pct: null, ebitda: null, ebitda_margin_pct: null,
        ebitda_growth_pct: null, depreciation: null, finance_cost: null, other_income: null,
        exceptional_items: 0, pbt: null, tax_pct: 25, pat: null, pat_growth_pct: null,
        pat_margin_pct: null, minority_interest: null, pat_for_shareholders: null,
        pe: null, peg: null, net_debt: null, lease_liability: null, total_debt: null,
        ev_ebitda_ratio: null, created_at: "", updated_at: "",
      } as FinancialYear;
      return { ...ms, financialYears: [...years, newYear] };
    });
  }, [company.id, updateModelState]);

  const handleRemoveYear = useCallback((modelId: string, idx: number) => {
    updateModelState(modelId, (ms) => {
      const newYears = ms.financialYears.filter((_, i) => i !== idx);
      const newOverrides = new Set<string>();
      ms.overrides.forEach((k) => {
        const dashIdx = k.lastIndexOf("-");
        const [field, yIdx] = [k.slice(0, dashIdx), parseInt(k.slice(dashIdx + 1))];
        if (yIdx < idx) newOverrides.add(k);
        else if (yIdx > idx) newOverrides.add(`${field}-${yIdx - 1}`);
      });
      return { ...ms, financialYears: newYears, overrides: newOverrides };
    });
  }, [updateModelState]);

  const handleScenarioChange = useCallback((modelId: string, type: ScenarioType, key: string, value: string) => {
    updateModelState(modelId, (ms) => ({
      ...ms,
      scenarioData: {
        ...ms.scenarioData,
        [type]: { ...ms.scenarioData[type], [key]: value === "" ? null : Number(value) },
      },
    }));
  }, [updateModelState]);

  const handleExpReturnsChange = useCallback((modelId: string, val: number) => {
    // Update all models to same expected returns
    setModelStates((prev) => prev.map((ms) => ({ ...ms, expReturns: val })));
  }, []);

  const handleAddModel = async (type: ProjectionType, label: string) => {
    const isFirst = modelStates.length === 0;
    const newModel = await createProjectionModel(company.id, type, label, isFirst);
    const ms = initModelState({ ...newModel, financial_years: [], valuation_scenarios: [] }, company);
    setModelStates((prev) => [...prev, ms]);
    setExpandedIds((prev) => new Set([...prev, newModel.id]));
  };

  const handleSetDefault = async (modelId: string) => {
    await setDefaultProjectionModel(company.id, modelId);
    setModelStates((prev) =>
      prev.map((ms) => ({
        ...ms,
        model: { ...ms.model, is_default: ms.model.id === modelId },
      }))
    );
  };

  const handleDeleteModel = async () => {
    if (!deleteTarget) return;
    await deleteProjectionModel(deleteTarget.id, company.id);
    setModelStates((prev) => prev.filter((ms) => ms.model.id !== deleteTarget.id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(deleteTarget.id);
      return next;
    });
    setDeleteTarget(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const models = modelStates.map((ms) => {
        const strategy = getStrategy(ms.model.projection_type);
        const computedYears = strategy.computeFields(ms.financialYears, ms.overrides, company.market_cap);
        const terminalYear = computedYears.length > 0 ? computedYears[computedYears.length - 1] : null;
        const companyForCalc = { ...company, expected_returns: ms.expReturns / 100 };

        const scenarios = (["bull", "base", "bare"] as const).map((type) => {
          const derived = strategy.computeValuationDerived(ms.scenarioData[type], terminalYear, companyForCalc);
          return { scenario_type: type, ...derived };
        });

        return {
          projection_model_id: ms.model.id,
          financial_years: computedYears.map(({ id, user_id, created_at, updated_at, ...fy }, idx) => ({
            ...fy,
            sort_order: idx,
          })),
          valuation_scenarios: scenarios,
        };
      });

      await saveAllProjections(company.id, models);

      // Also save expected_returns on company (use first model's value)
      if (modelStates.length > 0) {
        await updateCompany(company.id, { expected_returns: modelStates[0].expReturns / 100 });
      }

      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Projections & Valuations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Figures in Rs. Crores</p>
        </div>
        <div className="flex items-center gap-2">
          {availableTypes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5 rounded-full">
                  <Plus className="h-3.5 w-3.5" /> Add Model
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {availableTypes.map((t) => (
                  <DropdownMenuItem key={t.type} onClick={() => handleAddModel(t.type, t.label)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            size="sm"
            onClick={handleSaveAll}
            disabled={saving || modelStates.length === 0}
            className="h-8 px-4 text-xs gap-1.5 rounded-full"
          >
            <Save className="h-3.5 w-3.5" /> {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {modelStates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">No projection models yet.</p>
          <p className="text-xs mt-1">Click &quot;Add Model&quot; to create your first projection.</p>
        </div>
      )}

      {/* Accordion sections */}
      <div className="space-y-3">
        {modelStates.map((ms) => {
          const strategy = getStrategy(ms.model.projection_type);
          const isExpanded = expandedIds.has(ms.model.id);
          const computedYears = strategy.computeFields(ms.financialYears, ms.overrides, company.market_cap);

          return (
            <div key={ms.model.id} className="border border-border/60 rounded-lg overflow-hidden">
              {/* Section header */}
              <button
                onClick={() => toggleExpanded(ms.model.id)}
                className="w-full flex items-center justify-between px-5 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-semibold text-sm">{strategy.label}</span>
                  {ms.model.is_default && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
                      <Star className="h-3 w-3 fill-current" /> DEFAULT
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {!ms.model.is_default && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-amber-600"
                        onClick={() => handleSetDefault(ms.model.id)}
                        title="Set as default"
                      >
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-red-500"
                        onClick={() => setDeleteTarget({ id: ms.model.id, name: strategy.label })}
                        title="Delete model"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-5 py-4 space-y-6">
                  <ProjectionGrid
                    data={computedYears}
                    rowConfigs={strategy.rowConfigs}
                    overrides={ms.overrides}
                    onCellChange={(yearIdx, key, value) => handleCellChange(ms.model.id, yearIdx, key, value)}
                    onYearChange={(idx, value) => handleYearChange(ms.model.id, idx, value)}
                    onAddYear={() => handleAddYear(ms.model.id)}
                    onRemoveYear={(idx) => handleRemoveYear(ms.model.id, idx)}
                  />

                  <div className="border-t border-border/40 pt-4">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Valuation Scenarios</h3>
                    <ValuationScenarios
                      strategy={strategy}
                      scenarioData={ms.scenarioData}
                      financialYears={computedYears}
                      company={company}
                      expReturns={ms.expReturns}
                      onExpReturnsChange={(val) => handleExpReturnsChange(ms.model.id, val)}
                      onScenarioChange={(type, key, value) => handleScenarioChange(ms.model.id, type, key, value)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this projection model, all its financial year data, and valuation scenarios. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteModel} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/projections-valuation-tab.tsx
git commit -m "feat: create ProjectionsValuationTab with accordion layout and global save"
```

---

## Task 10: Wire Up — Update CompanyTabs to use new combined tab

**Files:**
- Modify: `src/components/company/company-tabs.tsx`

**Step 1: Replace separate Projections and Valuation tabs with combined tab**

Update `src/components/company/company-tabs.tsx`:

```typescript
"use client";

import { useState } from "react";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsValuationTab } from "@/components/company/projections-valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { Company, ProjectionModel, TimelineEntry } from "@/types/database";

const TABS = [
  { id: "details", label: "Details" },
  { id: "thesis", label: "Thesis" },
  { id: "projections", label: "Projections & Valuations" },
  { id: "timeline", label: "Timeline" },
  { id: "highlights", label: "Highlights" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CompanyTabs({
  company,
  projectionModels,
  timelineEntries,
}: {
  company: Company & { segment_valuations: any[]; market_perceptions: any[] };
  projectionModels: ProjectionModel[];
  timelineEntries: TimelineEntry[];
}) {
  const [activeTab, setActiveTab] = useState<TabId>("details");

  return (
    <div>
      {/* Tab navigation */}
      <nav className="border-b border-border/50 mt-2">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab content */}
      <div className="py-6">
        {activeTab === "thesis" && <ThesisTab company={company} />}
        {activeTab === "projections" && (
          <ProjectionsValuationTab
            company={company}
            projectionModels={projectionModels}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineTab companyId={company.id} entries={timelineEntries} />
        )}
        {activeTab === "highlights" && <HighlightsSection company={company} />}
        {activeTab === "details" && (
          <EditCompanyTab
            company={company}
            baseCaseBuyPrice={getDefaultModelBuyPrice(projectionModels)}
          />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/company/company-tabs.tsx
git commit -m "feat: replace separate Projections/Valuation tabs with combined ProjectionsValuationTab"
```

---

## Task 11: Update CompanyHeader — Use default projection model's scenarios

**Files:**
- Modify: `src/components/company/company-header.tsx`

**Step 1: No changes needed**

The `CompanyHeader` already receives `scenarios` as a prop. The `company/[id]/page.tsx` (updated in Task 5) now passes `defaultScenarios` extracted from the default projection model. No changes needed to the header component itself.

**Step 2: Verify**

Check that `company/[id]/page.tsx` passes `defaultScenarios` — done in Task 5.

---

## Task 12: Update Dashboard — Support projection model structure for valuation data

**Files:**
- Modify: `src/components/dashboard/companies-table.tsx`

**Step 1: Update the type and helpers to extract scenarios from default projection model**

The dashboard currently expects `company.valuation_scenarios` at the top level. After the schema change, scenarios live under `projection_models[].valuation_scenarios`. Update:

```typescript
// At the top of companies-table.tsx, change the type:
import type { Company, ProjectionModel, ValuationScenario } from "@/types/database";

type CompanyWithProjections = Company & {
  projection_models: (ProjectionModel & { valuation_scenarios: ValuationScenario[] })[];
};

// Add a helper to extract default model's scenarios:
function getDefaultScenarios(company: CompanyWithProjections): ValuationScenario[] {
  const defaultModel = company.projection_models?.find((pm) => pm.is_default);
  return defaultModel?.valuation_scenarios ?? [];
}

// Then update all references from:
//   company.valuation_scenarios
// to:
//   getDefaultScenarios(company)
```

Update the component props type from `CompanyWithScenarios` to `CompanyWithProjections` and update all references inside the component.

**Step 2: Commit**

```bash
git add src/components/dashboard/companies-table.tsx
git commit -m "feat: update dashboard table to use default projection model scenarios"
```

---

## Task 13: Clean Up — Remove old components and actions that are no longer needed

**Files:**
- Delete: `src/components/company/financial-model-tab.tsx` (replaced by ProjectionGrid + strategy)
- Delete: `src/components/company/valuation-tab.tsx` (replaced by ValuationScenarios + strategy)
- Keep: `src/app/(authenticated)/actions/financial-actions.ts` (still used for backward compat; can be removed later)
- Keep: `src/app/(authenticated)/actions/valuation-actions.ts` (still used for backward compat; can be removed later)

**Step 1: Delete old components**

```bash
rm src/components/company/financial-model-tab.tsx
rm src/components/company/valuation-tab.tsx
```

**Step 2: Remove old imports**

Check for any remaining imports of `FinancialModelTab` or `ValuationTab` and remove them. The main one was in `company-tabs.tsx` which was already updated in Task 10.

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old FinancialModelTab and ValuationTab (replaced by strategy-driven components)"
```

---

## Task 14: Test End-to-End — Verify the full flow

**Step 1: Run the dev server**

```bash
npm run dev
```

**Step 2: Manual testing checklist**

1. Open an existing company — verify the default PE/Earnings projection model appears with existing data
2. Edit cells in the projection grid — verify computations work correctly
3. Edit valuation scenarios — verify IRR, Buying MC, Buy Price compute
4. Click "Add Model" — select EV/EBITDA
5. Fill in EV/EBITDA projection data (Revenue, EBITDA Margins, Net Debt, Lease Liability)
6. Verify Total Debt = Net Debt + Lease Liability auto-computes
7. Verify EV/EBITDA ratio auto-computes
8. Override Total Debt manually — verify it turns purple and sticks
9. Fill EV/EBITDA valuation scenarios — verify Expected EV, Market Cap, IRR compute
10. Click "Save All" — verify both models save
11. Refresh page — verify data persists
12. Switch default to EV/EBITDA — verify company header shows EV/EBITDA base case metrics
13. Delete the PE/Earnings model — verify it's removed
14. Create a new company — verify it starts with no models (empty state)
15. Add PE/Earnings model — verify it becomes default automatically
16. Verify dashboard still shows correct buy price and IRR from default model

**Step 3: Fix any issues found**

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

## Task 15: Final Commit — Tag the feature complete

```bash
git add -A
git commit -m "feat: multi-projection valuation system with PE/Earnings and EV/EBITDA support"
```

---

## Summary of all files

### New files (7):
- `supabase/migrations/002_projection_models.sql`
- `src/lib/projections/types.ts`
- `src/lib/projections/pe-earnings-strategy.ts`
- `src/lib/projections/ev-ebitda-strategy.ts`
- `src/lib/projections/registry.ts`
- `src/app/(authenticated)/actions/projection-actions.ts`
- `src/components/company/projections-valuation-tab.tsx`
- `src/components/company/projection-grid.tsx`
- `src/components/company/valuation-scenarios.tsx`

### Modified files (7):
- `src/types/database.ts`
- `src/app/(authenticated)/company/[id]/page.tsx`
- `src/app/(authenticated)/actions/company-actions.ts`
- `src/app/(authenticated)/page.tsx`
- `src/lib/utils/calculations.ts`
- `src/components/company/company-tabs.tsx`
- `src/components/dashboard/companies-table.tsx`

### Deleted files (2):
- `src/components/company/financial-model-tab.tsx`
- `src/components/company/valuation-tab.tsx`
