export type ProjectionType = 'pe_earnings' | 'ev_ebitda';

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
  quantity: number | null;
  avg_buy_price: number | null;
  buy_date: string | null;
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

export type Transaction = {
  id: string;
  company_id: string;
  user_id: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  fees: number;
  date: string;
  notes: string | null;
  source: string;
  trade_id: string | null;
  trade_ids: string[];
  order_id: string | null;
  exchange: string | null;
  created_at: string;
  updated_at: string;
};

export type ImportJob = {
  id: string;
  user_id: string;
  portfolio_id: string;
  source: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_name: string | null;
  total_rows: number;
  processed_rows: number;
  imported_count: number;
  skipped_count: number;
  failed_count: number;
  summary: ImportJobSummary;
  errors: ImportJobError[];
  created_at: string;
  updated_at: string;
};

export type ImportJobSummary = {
  symbols_imported?: string[];
  symbols_skipped?: string[];
  symbols_failed?: string[];
  symbols_incomplete_history?: string[];
  new_companies_created?: string[];
  date_range?: string;
  client_id?: string;
};

export type ImportJobError = {
  symbol?: string;
  message: string;
  row?: number;
};
