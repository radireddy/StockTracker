"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { recomputeHoldings } from "@/lib/holdings";
import type { Transaction } from "@/types/database";

const log = createLogger({ service: "transaction-actions" });

export async function getTransactions(
  companyId: string,
  ownerId?: string
): Promise<Transaction[]> {
  const { supabase, user } = await getAuthUser();

  let query = supabase
    .from("transactions")
    .select("*, portfolio_owners(id, name)")
    .eq("company_id", companyId)
    .order("traded_at");

  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  const { data, error } = await query;

  if (error) {
    log.error("getTransactions failed", { error: error.message, companyId });
    throw new Error(error.message);
  }

  return data as Transaction[];
}

export async function addTransaction(
  companyId: string,
  input: {
    type: "BUY" | "SELL";
    quantity: number;
    price: number;
    fees?: number;
    traded_at: string;
    owner_id: string;
  }
) {
  const { supabase, user } = await getAuthUser();

  if (!input.owner_id) throw new Error("Owner is required");

  const { error } = await supabase.from("transactions").insert({
    company_id: companyId,
    user_id: user.id,
    owner_id: input.owner_id,
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees ?? 0,
    traded_at: input.traded_at,
    source: "manual",
  });

  if (error) {
    log.error("addTransaction failed", { error: error.message, companyId });
    throw new Error(error.message);
  }

  await recomputeHoldings(companyId, supabase);
  revalidatePath("/");
}

export async function updateTransaction(
  id: string,
  data: {
    type?: "BUY" | "SELL";
    quantity?: number;
    price?: number;
    fees?: number;
    traded_at?: string;
    owner_id?: string;
  }
) {
  const { supabase, user } = await getAuthUser();

  const { data: txn, error: fetchError } = await supabase
    .from("transactions")
    .select("company_id")
    .eq("id", id)
    .single();

  if (fetchError || !txn) {
    log.error("updateTransaction: transaction not found", { error: fetchError?.message, id });
    throw new Error("Transaction not found");
  }

  const { error } = await supabase
    .from("transactions")
    .update(data)
    .eq("id", id);

  if (error) {
    log.error("updateTransaction failed", { error: error.message, id });
    throw new Error(error.message);
  }

  await recomputeHoldings(txn.company_id, supabase);
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  const { supabase, user } = await getAuthUser();

  const { data: txn, error: fetchError } = await supabase
    .from("transactions")
    .select("company_id")
    .eq("id", id)
    .single();

  if (fetchError || !txn) {
    log.error("deleteTransaction: transaction not found", { error: fetchError?.message, id });
    throw new Error("Transaction not found");
  }

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", id);

  if (error) {
    log.error("deleteTransaction failed", { error: error.message, id });
    throw new Error(error.message);
  }

  await recomputeHoldings(txn.company_id, supabase);
  revalidatePath("/");
}

export async function recomputeAllHoldings(): Promise<{ recomputed: number; errors: string[] }> {
  const { supabase, user } = await getAuthUser();

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, isin, indian_stocks(nse_symbol)")
    .order("created_at");

  if (error) throw new Error(error.message);

  let recomputed = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    try {
      await recomputeHoldings(company.id, supabase);
      recomputed++;
    } catch (err) {
      errors.push(`${company.id}: ${(err as Error).message}`);
    }
  }

  revalidatePath("/");
  return { recomputed, errors };
}
