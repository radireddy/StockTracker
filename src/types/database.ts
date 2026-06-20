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
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  portfolio_id: string;
  user_id: string;
  name: string;
  symbol: string | null;
  sector: string | null;
  market_cap: number | null;
  current_price: number | null;
  buy_price: number | null;
  star_rating: number | null;
  strategy: "core" | "satellite" | null;
  investment_horizon_years: number | null;
  expected_returns: number | null;
  thesis: string | null;
  highlights: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinancialYear {
  id: string;
  company_id: string;
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
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ValuationScenario {
  id: string;
  company_id: string;
  user_id: string;
  scenario_type: "bull" | "base" | "bare";
  target_pe: number | null;
  target_market_cap: number | null;
  irr: number | null;
  buying_market_cap: number | null;
  buy_price: number | null;
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
