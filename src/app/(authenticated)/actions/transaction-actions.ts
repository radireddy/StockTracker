"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import type { Transaction } from "@/types/database";

const log = createLogger({ service: "transaction-actions" });

export async function getTransactions(companyId: string): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("date")
    .order("created_at");

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
    date: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("transactions").insert({
    company_id: companyId,
    user_id: user.id,
    type: input.type,
    quantity: input.quantity,
    price: input.price,
    fees: input.fees ?? 0,
    date: input.date,
    notes: input.notes ?? null,
  });

  if (error) {
    log.error("addTransaction failed", { error: error.message, companyId });
    throw new Error(error.message);
  }

  await recomputeHoldings(companyId);
  revalidatePath("/");
}

export async function updateTransaction(
  id: string,
  data: {
    type?: "BUY" | "SELL";
    quantity?: number;
    price?: number;
    fees?: number;
    date?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get company_id from the transaction first
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

  await recomputeHoldings(txn.company_id);
  revalidatePath("/");
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  // Get company_id from the transaction first
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

  await recomputeHoldings(txn.company_id);
  revalidatePath("/");
}

async function recomputeHoldings(companyId: string) {
  const supabase = await createClient();

  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("company_id", companyId)
    .order("date")
    .order("created_at");

  if (error) {
    log.error("recomputeHoldings: failed to fetch transactions", { error: error.message, companyId });
    throw new Error(error.message);
  }

  if (!transactions || transactions.length === 0) {
    const { error: updateError } = await supabase
      .from("companies")
      .update({ quantity: null, avg_buy_price: null, buy_date: null })
      .eq("id", companyId);

    if (updateError) {
      log.error("recomputeHoldings: failed to clear holdings", { error: updateError.message, companyId });
      throw new Error(updateError.message);
    }
    return;
  }

  // FIFO method (Indian stock market rule):
  // Sells consume the oldest buy lots first.
  // Average price = total remaining cost / total remaining quantity.
  const lots: { qty: number; price: number }[] = [];

  for (const txn of transactions) {
    if (txn.type === "BUY") {
      lots.push({ qty: txn.quantity, price: txn.price });
    } else if (txn.type === "SELL") {
      let remaining = txn.quantity;
      while (remaining > 0 && lots.length > 0) {
        if (lots[0].qty <= remaining) {
          remaining -= lots[0].qty;
          lots.shift();
        } else {
          lots[0].qty -= remaining;
          remaining = 0;
        }
      }
    }
  }

  const totalQty = lots.reduce((s, l) => s + l.qty, 0);
  const totalCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const avgPrice = totalQty > 0 ? totalCost / totalQty : null;

  // Get earliest remaining buy lot's date
  const earliestBuy = transactions.find((t) => t.type === "BUY");
  const buyDate = earliestBuy ? earliestBuy.date : null;

  const { error: updateError } = await supabase
    .from("companies")
    .update({
      quantity: totalQty > 0 ? totalQty : null,
      avg_buy_price: avgPrice,
      buy_date: buyDate,
    })
    .eq("id", companyId);

  if (updateError) {
    log.error("recomputeHoldings: failed to update company", { error: updateError.message, companyId });
    throw new Error(updateError.message);
  }
}

export async function recomputeAllHoldings(): Promise<{ recomputed: number; errors: string[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, isin, indian_stocks(nse_symbol)")
    .order("created_at");

  if (error) throw new Error(error.message);

  let recomputed = 0;
  const errors: string[] = [];

  for (const company of companies ?? []) {
    try {
      await recomputeHoldings(company.id);
      recomputed++;
    } catch (err) {
      errors.push(`${company.id}: ${(err as Error).message}`);
    }
  }

  revalidatePath("/");
  return { recomputed, errors };
}
