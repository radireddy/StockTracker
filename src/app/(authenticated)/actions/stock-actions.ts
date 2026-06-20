"use server";

import { createClient } from "@/lib/supabase/server";
import type { IndianStock } from "@/types/database";

export async function searchStocks(query: string): Promise<IndianStock[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!query || query.length < 2) return [];

  const q = query.trim();

  const { data, error } = await supabase
    .from("indian_stocks")
    .select("*")
    .or(`name.ilike.%${q}%,nse_symbol.ilike.%${q}%,bse_code.ilike.%${q}%`)
    .order("name")
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStockByIsin(isin: string): Promise<IndianStock | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("indian_stocks")
    .select("*")
    .eq("isin", isin)
    .single();

  if (error) return null;
  return data;
}
