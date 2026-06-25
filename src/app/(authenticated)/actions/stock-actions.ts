"use server";

import { getAuthUser } from "@/lib/supabase/server";
import type { IndianStock } from "@/types/database";
import { createLogger } from "@/lib/logger";
const log = createLogger({ service: "stock-actions" });

export async function searchStocks(query: string): Promise<IndianStock[]> {
  const { supabase, user } = await getAuthUser();

  if (!query || query.length < 2) return [];

  const q = query.trim();

  const { data, error } = await supabase
    .from("indian_stocks")
    .select("*")
    .or(`name.ilike.%${q}%,nse_symbol.ilike.%${q}%,bse_code.ilike.%${q}%`)
    .order("name")
    .limit(20);

  if (error) {
    log.error("searchStocks failed", { error: error.message, query: q });
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getStockByIsin(isin: string): Promise<IndianStock | null> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("indian_stocks")
    .select("*")
    .eq("isin", isin)
    .single();

  if (error) {
    log.error("getStockByIsin failed", { error: error.message, isin });
    return null;
  }
  return data;
}
