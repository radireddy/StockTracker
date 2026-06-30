import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "holdings" });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/**
 * Recompute holdings for a company using FIFO:
 * 1. Per-owner FIFO → upsert owner_holdings
 * 2. Delete stale owner_holdings for owners with no transactions
 * 3. Aggregate across owners → update companies.quantity/avg_buy_price
 *
 * Returns true if the company has incomplete history (more sells than buys).
 */
export async function recomputeHoldings(
  companyId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { data: transactions, error } = await supabase
    .from("transactions")
    .select("type, quantity, price, traded_at, owner_id, user_id")
    .eq("company_id", companyId)
    .order("traded_at");

  if (error) {
    log.error("recomputeHoldings: failed to fetch transactions", {
      error: error.message,
      companyId,
    });
    throw new Error(error.message);
  }

  if (!transactions || transactions.length === 0) {
    await supabase
      .from("companies")
      .update({ quantity: null, avg_buy_price: null, buy_date: null })
      .eq("id", companyId);
    await supabase
      .from("owner_holdings")
      .delete()
      .eq("company_id", companyId);
    return false;
  }

  // Group transactions by owner
  const byOwner = new Map<
    string,
    Array<{
      type: string;
      quantity: number;
      price: number;
      traded_at: string;
      owner_id: string;
      user_id: string;
    }>
  >();
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
  let incompleteHistory = false;

  // Process each owner separately with FIFO
  for (const [ownerId, ownerTxns] of byOwner) {
    let hasBuys = false;
    let hasSells = false;
    const lots: { qty: number; price: number }[] = [];

    for (const txn of ownerTxns) {
      if (txn.type === "BUY") {
        lots.push({ qty: txn.quantity, price: txn.price });
        hasBuys = true;
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
        hasSells = true;
      }
    }

    const ownerQty = lots.reduce((s, l) => s + l.qty, 0);
    const ownerCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
    const ownerIncomplete = ownerQty < 0 || (hasSells && !hasBuys);
    if (ownerIncomplete) incompleteHistory = true;

    const ownerAvgPrice =
      ownerQty > 0
        ? Math.round((ownerCost / ownerQty) * 100) / 100
        : null;
    const earliestBuy = ownerTxns.find((t) => t.type === "BUY");
    const buyDate = earliestBuy ? earliestBuy.traded_at.slice(0, 10) : null;

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

  // Delete stale owner_holdings for owners who no longer have transactions
  const ownerIdsWithTxns = [...byOwner.keys()];
  if (ownerIdsWithTxns.length > 0) {
    await supabase
      .from("owner_holdings")
      .delete()
      .eq("company_id", companyId)
      .not("owner_id", "in", `(${ownerIdsWithTxns.join(",")})`);
  }

  // Update company-level aggregate
  const aggAvgPrice =
    totalQtyAll > 0
      ? Math.round((totalCostAll / totalQtyAll) * 100) / 100
      : null;
  const { error: updateError } = await supabase
    .from("companies")
    .update({
      quantity: totalQtyAll > 0 ? totalQtyAll : 0,
      avg_buy_price: aggAvgPrice,
      buy_date: earliestBuyDateAll,
    })
    .eq("id", companyId);

  if (updateError) {
    log.error("recomputeHoldings: failed to update company", {
      error: updateError.message,
      companyId,
    });
    throw new Error(updateError.message);
  }

  return incompleteHistory;
}
