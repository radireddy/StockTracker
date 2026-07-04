export type ProjectionType = 'pe_earnings' | 'ev_ebitda';

export type AllocationRange = { min: number; max: number };
export type AllocationRanges = Record<string, AllocationRange>;

export const DEFAULT_ALLOCATION_RANGES: AllocationRanges = {
  "1": { min: 0, max: 2 },
  "2": { min: 2, max: 4 },
  "3": { min: 4, max: 6 },
  "4": { min: 6, max: 8 },
};

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  plan: "free" | "basic" | "pro" | "premium";
  plan_limits: {
    max_companies: number;
    max_portfolios: number;
    alerts_enabled: boolean;
  };
  allocation_ranges: AllocationRanges | null;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  type: 'holdings' | 'watchlist';
  sort_order: number;
  color: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface IndianStock {
  isin: string;
  name: string;
  nse_symbol: string | null;
  bse_code: string | null;
  sector: string | null;
  industry: string | null;
  series: string | null;
  exchange: "NSE" | "BSE" | "BOTH";
  price: number | null;
  change: number | null;
  change_pct: number | null;
  volume: number | null;
  market_cap: number | null;
  last_updated: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  portfolio_id: string;
  user_id: string;
  isin: string;
  buy_price: number | null;
  star_rating: number | null;
  strategy: "core" | "satellite" | null;
  investment_horizon_years: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined from indian_stocks
  indian_stocks?: IndianStock;
}

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

/**
 * Company with the nested relations loaded by the company detail query
 * (see `app/(authenticated)/company/[id]/page.tsx`). Relations are optional
 * because they depend on the specific Supabase select used.
 */
export interface CompanyWithRelations extends Company {
  projection_models?: ProjectionModel[];
  segment_valuations?: SegmentValuation[];
  market_perceptions?: MarketPerception[];
}

export interface FinancialYear {
  id: string;
  company_id: string;
  projection_model_id: string | null;
  user_id: string;
  year: string;
  is_estimate: boolean;
  revenue: number | null;
  revenue_growth_pct: number | null;
  ebitda: number | null;
  ebitda_margin_pct: number | null;
  ebitda_growth_pct: number | null;
  depreciation: number | null;
  finance_cost: number | null;
  other_income: number | null;
  exceptional_items: number | null;
  pbt: number | null;
  tax_pct: number | null;
  pat: number | null;
  pat_growth_pct: number | null;
  pat_margin_pct: number | null;
  minority_interest: number | null;
  pat_for_shareholders: number | null;
  pe: number | null;
  peg: number | null;
  net_debt: number | null;
  lease_liability: number | null;
  total_debt: number | null;
  ev_ebitda_ratio: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ValuationScenario {
  id: string;
  company_id: string;
  projection_model_id: string | null;
  user_id: string;
  scenario_type: "bull" | "base" | "bare";
  target_pe: number | null;
  target_market_cap: number | null;
  irr: number | null;
  buying_market_cap: number | null;
  buy_price: number | null;
  target_ev_ebitda_ratio: number | null;
  expected_ev: number | null;
  net_debt_terminal: number | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: string;
  company_id: string;
  user_id: string;
  quarter: string | null;
  entry_date: string | null;
  content: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface SegmentValuation {
  id: string;
  company_id: string;
  user_id: string;
  segment_name: string;
  management_signal: string | null;
  metrics: string | null;
  multiple: string | null;
  estimated_value: number | null;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface MarketPerception {
  id: string;
  company_id: string;
  user_id: string;
  perception: string;
  own_view: string;
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

/** A broker demat account (flat model). One account = broker + client_id + label. */
export interface Account {
  id: string;
  user_id: string;
  label: string;
  broker: string;           // 'zerodha' | 'manual' | (future brokers)
  client_id: string | null; // broker demat id; null for manual-only accounts
  pan_number: string | null;
  mobile: string | null;
  created_at: string;
  updated_at: string;
}

/** Per-account per-company position snapshot (imported directly, not derived). */
export interface Holding {
  id: string;
  user_id: string;
  portfolio_id: string;
  account_id: string;
  company_id: string;
  isin: string;
  quantity: number;
  avg_buy_price: number;
  sector: string | null;
  source: string;           // 'zerodha' | 'manual'
  import_holding_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  accounts?: Account;
}

/** One statement import (synchronous; replaces the old async import_jobs). */
export type ImportHolding = {
  id: string;
  user_id: string;
  portfolio_id: string;
  account_id: string;
  broker: string;
  client_id: string | null;
  statement_date: string | null;
  file_name: string | null;
  status: 'completed' | 'failed';
  is_reimport: boolean;
  companies_count: number;
  imported_count: number;
  skipped_count: number;
  summary: ImportHoldingSummary;
  errors: ImportHoldingError[];
  created_at: string;
  // Joined
  accounts?: Account;
};

export type ImportHoldingSummary = {
  symbols_imported?: string[];
  symbols_skipped?: string[];
  new_companies_created?: string[];
  statement_date?: string;
  client_id?: string;
  account_label?: string;
};

export type ImportHoldingError = {
  symbol?: string;
  message: string;
  row?: number;
};
