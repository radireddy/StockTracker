-- ============================================================================
-- Migration: Add projection_models table and migrate existing data
-- ============================================================================
-- Introduces a projection_models parent entity so each company can have
-- multiple projection types (PE/Earnings, EV/EBITDA). Existing financial_years
-- and valuation_scenarios rows are linked to an auto-created pe_earnings model.
-- ============================================================================

-- 1. Create projection_models table
-- ----------------------------------------------------------------------------

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

-- Only one default projection model per company
CREATE UNIQUE INDEX idx_projection_models_one_default
  ON projection_models (company_id)
  WHERE is_default = true;

CREATE INDEX idx_projection_models_company ON projection_models(company_id);

ALTER TABLE projection_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own projection models"
  ON projection_models FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON projection_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. Alter financial_years
-- ----------------------------------------------------------------------------

-- Add new columns
ALTER TABLE financial_years
  ADD COLUMN projection_model_id UUID REFERENCES projection_models(id) ON DELETE CASCADE,
  ADD COLUMN net_debt NUMERIC,
  ADD COLUMN lease_liability NUMERIC,
  ADD COLUMN total_debt NUMERIC,
  ADD COLUMN ev_ebitda_ratio NUMERIC;

-- 3. Alter valuation_scenarios
-- ----------------------------------------------------------------------------

-- Add new columns
ALTER TABLE valuation_scenarios
  ADD COLUMN projection_model_id UUID REFERENCES projection_models(id) ON DELETE CASCADE,
  ADD COLUMN target_ev_ebitda_ratio NUMERIC,
  ADD COLUMN expected_ev NUMERIC,
  ADD COLUMN net_debt_terminal NUMERIC;

-- 4. Data migration: create pe_earnings projection models for existing data
-- ----------------------------------------------------------------------------

-- Insert a pe_earnings projection model for every company that has financial
-- years or valuation scenarios (de-duplicated via UNION).
INSERT INTO projection_models (company_id, user_id, projection_type, name, is_default, sort_order)
SELECT DISTINCT c.id, c.user_id, 'pe_earnings', 'PE / Earnings', true, 0
FROM companies c
WHERE EXISTS (
  SELECT 1 FROM financial_years fy WHERE fy.company_id = c.id
)
OR EXISTS (
  SELECT 1 FROM valuation_scenarios vs WHERE vs.company_id = c.id
);

-- Link existing financial_years to their projection model
UPDATE financial_years fy
SET projection_model_id = pm.id
FROM projection_models pm
WHERE pm.company_id = fy.company_id
  AND pm.projection_type = 'pe_earnings';

-- Link existing valuation_scenarios to their projection model
UPDATE valuation_scenarios vs
SET projection_model_id = pm.id
FROM projection_models pm
WHERE pm.company_id = vs.company_id
  AND pm.projection_type = 'pe_earnings';

-- 5. Swap unique constraints now that data is migrated
-- ----------------------------------------------------------------------------

-- financial_years: drop old constraint, add new one
ALTER TABLE financial_years
  DROP CONSTRAINT financial_years_company_id_year_key;

ALTER TABLE financial_years
  ADD CONSTRAINT financial_years_projection_model_id_year_key
  UNIQUE (projection_model_id, year);

CREATE INDEX idx_financial_years_projection_model
  ON financial_years(projection_model_id);

-- valuation_scenarios: drop old constraint, add new one
ALTER TABLE valuation_scenarios
  DROP CONSTRAINT valuation_scenarios_company_id_scenario_type_key;

ALTER TABLE valuation_scenarios
  ADD CONSTRAINT valuation_scenarios_projection_model_id_scenario_type_key
  UNIQUE (projection_model_id, scenario_type);

CREATE INDEX idx_valuation_scenarios_projection_model
  ON valuation_scenarios(projection_model_id);
