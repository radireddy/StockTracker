"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export const DASHBOARD_QUERY_KEY = "dashboard-data";

export type DashboardHolding = {
  company_id: string;
  owner_id: string;
  quantity: number;
  avg_buy_price: number | null;
  buy_date: string | null;
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

export type DashboardCompany = {
  id: string;
  isin: string;
  star_rating: number | null;
  strategy: string | null;
  quantity: number | null;
  avg_buy_price: number | null;
  buy_price: number | null;
  investment_horizon_years: number | null;
  indian_stocks: DashboardStock | null;
  projection_models: DashboardProjectionModel[];
};

export type DashboardData = {
  companies: DashboardCompany[];
  owners: { id: string; name: string; is_default: boolean }[];
  allHoldings: DashboardHolding[];
  allocationRanges: Record<string, { min: number; max: number }> | null;
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
  portfolioType: "holdings" | "watchlist",
  ownerFilter: string
) {
  return useQuery({
    queryKey: [DASHBOARD_QUERY_KEY, portfolioId, portfolioType, ownerFilter],
    queryFn: () => fetchDashboard(portfolioId, portfolioType),
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useInvalidateDashboard() {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: [DASHBOARD_QUERY_KEY] }),
    [qc]
  );
}
