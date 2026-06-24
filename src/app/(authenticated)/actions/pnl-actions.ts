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

export async function getPortfolioPnL(
  portfolioId: string
): Promise<PortfolioPnL> {
  const supabase = await createClient();

  const { data: companies, error } = await supabase
    .from("companies")
    .select("quantity, avg_buy_price, isin, indian_stocks(price)")
    .eq("portfolio_id", portfolioId)
    .not("quantity", "is", null)
    .not("avg_buy_price", "is", null);

  if (error) {
    log.error("Failed to fetch companies for portfolio P&L", {
      portfolioId,
      error: error.message,
    });
    throw new Error(error.message);
  }

  let total_invested = 0;
  let total_current = 0;

  for (const company of companies ?? []) {
    const quantity = company.quantity!;
    const avgBuyPrice = company.avg_buy_price!;
    const stock = company.indian_stocks as unknown as {
      price: number | null;
    } | null;
    const currentPrice = stock?.price ?? 0;

    total_invested += avgBuyPrice * quantity;
    total_current += currentPrice * quantity;
  }

  const total_pnl = total_current - total_invested;
  const total_pnl_pct = total_invested > 0 ? (total_pnl / total_invested) * 100 : 0;

  return { total_invested, total_current, total_pnl, total_pnl_pct };
}

export async function getCompanyPnL(companyId: string): Promise<CompanyPnL> {
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from("companies")
    .select("quantity, avg_buy_price, indian_stocks(price)")
    .eq("id", companyId)
    .single();

  if (error) {
    log.error("Failed to fetch company for P&L", {
      companyId,
      error: error.message,
    });
    throw new Error(error.message);
  }

  const quantity = company.quantity ?? 0;
  const avgBuyPrice = company.avg_buy_price ?? 0;
  const stock = company.indian_stocks as unknown as {
    price: number | null;
  } | null;
  const currentPrice = stock?.price ?? 0;

  const invested = avgBuyPrice * quantity;
  const current = currentPrice * quantity;
  const pnl = current - invested;
  const pnl_pct = invested > 0 ? (pnl / invested) * 100 : 0;

  return { invested, current, pnl, pnl_pct };
}
