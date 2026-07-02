"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export const DASHBOARD_QUERY_KEY = "dashboard-data";

export type DashboardHolding = {
  company_id: string;
  account_id: string;
  quantity: number;
  avg_buy_price: number | null;
};

export type DashboardAccount = {
  id: string;
  label: string;
  broker: string;
};

export type DashboardStock = {
  name: string | null;
  nse_symbol: string | null;
  price: number | null;
  market_cap: number | null;
};

export type DashboardProjectionModel = {
  is_default: boolean;
  valuation_scenarios: {
    scenario_type: string;
    target_market_cap: number | null;
    irr: number | null;
    buy_price: number | null;
  }[];
};

/** Research fields straight from `companies` (position is derived from holdings). */
export type DashboardCompany = {
  id: string;
  isin: string;
  star_rating: number | null;
  strategy: string | null;
  buy_price: number | null;
  investment_horizon_years: number | null;
  indian_stocks: DashboardStock | null;
  projection_models: DashboardProjectionModel[];
};

/** A company row with its consolidated (or account-filtered) position attached. */
export type DashboardCompanyRow = DashboardCompany & {
  quantity: number | null;
  avg_buy_price: number | null;
};

export type DashboardData = {
  companies: DashboardCompany[];
  accounts: DashboardAccount[];
  allHoldings: DashboardHolding[];
};

async function fetchDashboard(portfolioId: string, portfolioType: string): Promise<DashboardData> {
  const params = new URLSearchParams({ portfolioId, portfolioType });
  const res = await fetch(`/api/dashboard?${params}`);
  if (!res.ok) {
    throw new Error(`Dashboard fetch failed: ${res.status}`);
  }
  return res.json();
}

export function useDashboardData(
  portfolioId: string,
  portfolioType: "holdings" | "watchlist"
) {
  return useQuery({
    queryKey: [DASHBOARD_QUERY_KEY, portfolioId, portfolioType],
    queryFn: () => fetchDashboard(portfolioId, portfolioType),
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  });
}

/**
 * Consolidate holdings into per-company positions.
 * - accountFilter "all" → sum across every account (cost-weighted avg price),
 *   and every company is shown (research-only companies get a null position).
 * - accountFilter = an account id → only companies held in that account.
 */
export function consolidateHoldings(
  companies: DashboardCompany[],
  allHoldings: DashboardHolding[],
  accountFilter: string
): DashboardCompanyRow[] {
  const agg = new Map<string, { qty: number; cost: number }>();
  for (const h of allHoldings) {
    if (accountFilter !== "all" && h.account_id !== accountFilter) continue;
    const cur = agg.get(h.company_id) ?? { qty: 0, cost: 0 };
    cur.qty += h.quantity;
    cur.cost += h.quantity * (h.avg_buy_price ?? 0);
    agg.set(h.company_id, cur);
  }

  const rows: DashboardCompanyRow[] = [];
  for (const c of companies) {
    const a = agg.get(c.id);
    if (accountFilter !== "all") {
      if (!a || a.qty <= 0) continue; // account view: only stocks held in that account
      rows.push({ ...c, quantity: a.qty, avg_buy_price: a.qty > 0 ? a.cost / a.qty : null });
    } else {
      rows.push({
        ...c,
        quantity: a ? a.qty : null,
        avg_buy_price: a && a.qty > 0 ? a.cost / a.qty : null,
      });
    }
  }
  return rows;
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: [DASHBOARD_QUERY_KEY] }),
    [qc]
  );
}
