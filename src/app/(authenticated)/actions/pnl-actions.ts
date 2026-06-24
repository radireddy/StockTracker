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

/**
 * Get portfolio P&L.
 * If ownerId is provided, returns P&L for that owner only (from owner_holdings).
 * Otherwise, returns aggregate P&L across all owners (from companies table).
 */
export async function getPortfolioPnL(
  portfolioId: string,
  ownerId?: string
): Promise<PortfolioPnL> {
  const supabase = await createClient();

  if (ownerId) {
    // Per-owner P&L from owner_holdings
    const { data: companies, error: cErr } = await supabase
      .from("companies")
      .select("id, isin, indian_stocks(price)")
      .eq("portfolio_id", portfolioId);

    if (cErr) {
      log.error("Failed to fetch companies for owner P&L", { portfolioId, error: cErr.message });
      throw new Error(cErr.message);
    }

    const companyIds = (companies ?? []).map((c) => c.id);
    if (companyIds.length === 0) {
      return { total_invested: 0, total_current: 0, total_pnl: 0, total_pnl_pct: 0 };
    }

    const { data: holdings, error: hErr } = await supabase
      .from("owner_holdings")
      .select("company_id, quantity, avg_buy_price")
      .eq("owner_id", ownerId)
      .in("company_id", companyIds)
      .not("quantity", "is", null)
      .not("avg_buy_price", "is", null);

    if (hErr) {
      log.error("Failed to fetch owner holdings for P&L", { ownerId, error: hErr.message });
      throw new Error(hErr.message);
    }

    // Build price map from companies
    const priceMap = new Map<string, number>();
    for (const c of companies ?? []) {
      const stock = c.indian_stocks as unknown as { price: number | null } | null;
      if (stock?.price != null) priceMap.set(c.id, stock.price);
    }

    let total_invested = 0;
    let total_current = 0;

    for (const h of holdings ?? []) {
      const qty = h.quantity ?? 0;
      const avgBuy = h.avg_buy_price ?? 0;
      const currentPrice = priceMap.get(h.company_id) ?? 0;
      total_invested += avgBuy * qty;
      total_current += currentPrice * qty;
    }

    const total_pnl = total_current - total_invested;
    const total_pnl_pct = total_invested > 0 ? (total_pnl / total_invested) * 100 : 0;
    return { total_invested, total_current, total_pnl, total_pnl_pct };
  }

  // Aggregate P&L from companies table (all owners merged)
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
