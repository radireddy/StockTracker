# Multi-Projection & Valuation System Design

**Date**: 2026-06-20
**Status**: Approved

## Overview

Extend the StockTracker app to support multiple projection and valuation types per company (PE/Earnings, EV/EBITDA), with an extensible Strategy pattern for adding future types. Each projection type has its own set of Bull/Base/Bare valuation scenarios. One projection is marked as default and used for derived company metrics.

## Database Schema

### New table: `projection_models`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| company_id | UUID FK -> companies | |
| user_id | UUID FK -> profiles | RLS |
| projection_type | TEXT | 'pe_earnings' or 'ev_ebitda' |
| name | TEXT | Display name, e.g. "PE / Earnings" |
| is_default | BOOLEAN | Default false |
| sort_order | INTEGER | Default 0 |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Constraints:
- `UNIQUE(company_id, projection_type)` -- one per type per company
- Partial unique index: `UNIQUE(company_id) WHERE is_default = true` -- exactly one default

### Modified: `financial_years`

New columns:
- `projection_model_id` (UUID FK -> projection_models)
- `net_debt` (NUMERIC) -- EV/EBITDA
- `lease_liability` (NUMERIC) -- EV/EBITDA
- `total_debt` (NUMERIC) -- EV/EBITDA, computed but overridable
- `ev_ebitda_ratio` (NUMERIC) -- EV/EBITDA, computed but overridable

Changed constraints:
- Unique key changes from `(company_id, year)` to `(projection_model_id, year)`

### Modified: `valuation_scenarios`

New columns:
- `projection_model_id` (UUID FK -> projection_models)
- `target_ev_ebitda_ratio` (NUMERIC) -- EV/EBITDA input
- `expected_ev` (NUMERIC) -- EV/EBITDA computed
- `net_debt_terminal` (NUMERIC) -- EV/EBITDA, net debt at terminal year

Changed constraints:
- Unique key changes from `(company_id, scenario_type)` to `(projection_model_id, scenario_type)`

## Strategy Pattern Architecture

### Interface: `ProjectionStrategy`

```typescript
type ProjectionType = 'pe_earnings' | 'ev_ebitda';

interface ProjectionStrategy {
  type: ProjectionType;
  label: string;
  rowConfigs: RowConfig[];
  computeFields(years: FinancialYear[], company: Company): FinancialYear[];
  getValuationInputs(): ValuationFieldConfig[];
  computeValuation(scenario, terminalYear, company): ValuationScenario;
  getTerminalMetricLabel(): string;
}
```

### Strategies

**PeEarningsStrategy**: Extracts existing 3-pass computation logic.
- Rows: Revenue, Revenue Growth%, EBITDA Margin%, EBITDA, EBITDA Growth%, Depreciation, Interest, Other Income, Exceptional Items, PBT, Tax%, PAT, PAT Growth%, PAT Margin%, PE, PEG
- Valuation: Target PE x Terminal PAT = Target Market Cap -> IRR, Buying MC, Buy Price

**EvEbitdaStrategy**: New.
- Rows: Revenue, Revenue Growth%, EBITDA Margins%, EBITDA, EBITDA Growth%, Net Debt, Lease Liability, Total Debt (computed, overridable), EV/EBITDA (computed, overridable)
- Valuation: Target EV/EBITDA Ratio x Terminal EBITDA = Expected EV; Market Cap = EV - Net Debt Terminal -> IRR, Buying MC, Buy Price

### Registry

```typescript
const strategies: Record<ProjectionType, ProjectionStrategy> = {
  pe_earnings: new PeEarningsStrategy(),
  ev_ebitda: new EvEbitdaStrategy(),
};
```

Adding a new type: implement strategy, add nullable columns if needed, register.

## UI Design

### Layout: Accordion pattern within a single "Projections & Valuations" tab

```
Projections & Valuations              [+ Add Model]

+-- PE / Earnings ----------- [star] DEFAULT -- [v] --+
|  [Projection Grid]                                   |
|  [Valuation Scenarios - Bull/Base/Bare]              |
+------------------------------------------------------+

+-- EV / EBITDA ----------------------------- [v] --+
|  [Projection Grid]                                 |
|  [Valuation Scenarios - Bull/Base/Bare]            |
+----------------------------------------------------+

                                      [Save All Models]
```

### Behaviors

- Collapsible sections per projection model
- Default badge (star) -- click to switch default
- Delete (trash) on non-default sections, with confirmation
- "+ Add Model" dropdown shows only types not yet created
- Global Save button saves all models, years, and scenarios
- Type is immutable after creation
- Grid driven by strategy.rowConfigs -- no hardcoded rows in UI

## Server Actions

- `createProjectionModel(company_id, projection_type, name, is_default)`
- `saveAllProjections(company_id, models[])` -- bulk upsert all models/years/scenarios
- `deleteProjectionModel(projection_model_id)` -- cascades
- `setDefaultProjectionModel(company_id, projection_model_id)`

## Data Flow

1. `getCompany()` fetches projection_models with nested financial_years + valuation_scenarios
2. For each model, `getStrategy(model.projection_type)` provides row configs + computation
3. UI renders ProjectionSection per model
4. User edits cells -> `strategy.computeFields()` recalculates live
5. User clicks Save -> `saveAllProjections()` bulk upserts
6. Default model's base case buy_price used for company header metrics

## Derived Values (Company Header)

- Buy Price: from default projection model's base case valuation scenario
- Margin of Safety: based on default model's buy price
- IRR: from default model's base case
- Horizon: count of estimate years in default model
