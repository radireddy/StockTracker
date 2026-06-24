"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import type { Transaction } from "@/types/database";

const log = createLogger({ service: "transaction-actions" });

export async function getTransactions(
  companyId: string,
  ownerId?: string
): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let query = supabase
    .from("transactions")
    .select("*, portfolio_owners(id, name)")
    .eq("company_id", companyId)
    .order("date")
    .order("created_at");

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
    date: string;
    notes?: string;
    owner_id: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (!input.owner_id) throw new Error("Owner is required");

  const { error } = await supabase.from("transactions").insert({
    company_id: companyId,
    user_id: user.id,
    owner_id: input.owner_id,
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
    owner_id?: string;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

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

/**
 * Recompute holdings for a company:
 * 1. Per-owner FIFO → update owner_holdings
 * 2. Aggregate across owners → update companies.quantity/avg_buy_price
 */
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
    // Clear company-level holdings
    await supabase
      .from("companies")
      .update({ quantity: null, avg_buy_price: null, buy_date: null })
      .eq("id", companyId);
    // Delete all owner_holdings for this company
    await supabase
      .from("owner_holdings")
      .delete()
      .eq("company_id", companyId);
    return;
  }

  // Group transactions by owner
  const byOwner = new Map<string, typeof transactions>();
  for (const txn of transactions) {
    const existing = byOwner.get(txn.owner_id);
    if (existing) {
      existing.push(txn);
    } else {
      byOwner.set(txn.owner_id, [txn]);
    }
  }

  let totalQtyAll = 0;
  let totalCostAll = 0;
  let earliestBuyDateAll: string | null = null;

  // Process each owner separately with FIFO
  for (const [ownerId, ownerTxns] of byOwner) {
    const lots: { qty: number; price: number }[] = [];

    for (const txn of ownerTxns) {
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

    const ownerQty = lots.reduce((s, l) => s + l.qty, 0);
    const ownerCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const ownerAvgPrice = ownerQty > 0 ? Math.round((ownerCost / ownerQty) * 100) / 100 : null;
    const earliestBuy = ownerTxns.find((t) => t.type === "BUY");
    const buyDate = earliestBuy ? earliestBuy.date : null;

    // Upsert owner_holdings
    const { error: upsertErr } = await supabase
      .from("owner_holdings")
      .upsert(
        {
          company_id: companyId,
          owner_id: ownerId,
          user_id: ownerTxns[0].user_id,
          quantity: ownerQty > 0 ? ownerQty : 0,
          avg_buy_price: ownerAvgPrice,
          buy_date: buyDate,
        },
        { onConflict: "company_id,owner_id" }
      );

    if (upsertErr) {
      log.error("recomputeHoldings: failed to upsert owner_holdings", {
        error: upsertErr.message,
        companyId,
        ownerId,
      });
    }

    // Aggregate
    if (ownerQty > 0) {
      totalQtyAll += ownerQty;
      totalCostAll += ownerCost;
      if (!earliestBuyDateAll || (buyDate && buyDate < earliestBuyDateAll)) {
        earliestBuyDateAll = buyDate;
      }
    }
  }

  // Delete owner_holdings for owners who no longer have transactions
  const ownerIdsWithTxns = [...byOwner.keys()];
  if (ownerIdsWithTxns.length > 0) {
    await supabase
      .from("owner_holdings")
      .delete()
      .eq("company_id", companyId)
      .not("owner_id", "in", `(${ownerIdsWithTxns.join(",")})`);
  }

  // Update company-level aggregate
  const aggAvgPrice = totalQtyAll > 0 ? Math.round((totalCostAll / totalQtyAll) * 100) / 100 : null;
  const { error: updateError } = await supabase
    .from("companies")
    .update({
      quantity: totalQtyAll > 0 ? totalQtyAll : 0,
      avg_buy_price: aggAvgPrice,
      buy_date: earliestBuyDateAll,
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
