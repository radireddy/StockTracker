"use server";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "pnl-actions" });

export type PortfolioPnL = {
  total_invested: number;
  total_current: number;
  total_pnl: number;
  total_pnl_pct: number;
};

export type CompanyPnL = {
  invested: number;
  current: number;
  pnl: number;
  pnl_pct: number;
};

type HoldingPriceRow = {
  quantity: number | null;
  avg_buy_price: number | null;
  companies: { indian_stocks: { price: number | null } | null } | null;
};

function reduceHoldings(rows: HoldingPriceRow[]): { invested: number; current: number } {
  let invested = 0;
  let current = 0;
  for (const h of rows) {
    const qty = h.quantity ?? 0;
    const avgBuy = h.avg_buy_price ?? 0;
    const price = h.companies?.indian_stocks?.price ?? 0;
    invested += avgBuy * qty;
    current += price * qty;
  }
  return { invested, current };
}

/**
 * Portfolio P&L from `holdings`.
 * Consolidated across all accounts by default; pass accountId to scope to one account.
 */
export async function getPortfolioPnL(
  portfolioId: string,
  accountId?: string
): Promise<PortfolioPnL> {
  const supabase = await createClient();

  let query = supabase
    .from("holdings")
    .select("quantity, avg_buy_price, companies(indian_stocks(price))")
    .eq("portfolio_id", portfolioId);
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) {
    log.error("Failed to fetch holdings for portfolio P&L", { portfolioId, error: error.message });
    throw new Error(error.message);
  }

  const { invested, current } = reduceHoldings((data ?? []) as unknown as HoldingPriceRow[]);
  const total_pnl = current - invested;
  return {
    total_invested: invested,
    total_current: current,
    total_pnl,
    total_pnl_pct: invested > 0 ? (total_pnl / invested) * 100 : 0,
  };
}

/** Company P&L summed across all accounts in a portfolio. */
export async function getCompanyPnL(companyId: string): Promise<CompanyPnL> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("holdings")
    .select("quantity, avg_buy_price, companies(indian_stocks(price))")
    .eq("company_id", companyId);

  if (error) {
    log.error("Failed to fetch holdings for company P&L", { companyId, error: error.message });
    throw new Error(error.message);
  }

  const { invested, current } = reduceHoldings((data ?? []) as unknown as HoldingPriceRow[]);
  const pnl = current - invested;
  return {
    invested,
    current,
    pnl,
    pnl_pct: invested > 0 ? (pnl / invested) * 100 : 0,
  };
}
