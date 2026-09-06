"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { action, AppError, type ActionResult } from "@/lib/action-result";
import { recomputeFifoForAccount } from "@/lib/import/tradebook-import-engine";
import { loadCorporateActionContext } from "@/lib/import/corporate-actions-data";
import { deriveRemainingLots, type TradeForOpenPositions } from "@/lib/import/open-positions";
import { fetchAllRows } from "@/lib/supabase/paginate";

const QTY_EPS = 1e-6;

/** Today as YYYY-MM-DD in local time (trade dates are calendar days). */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertQty(q: unknown): number {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) throw new AppError("Quantity must be greater than zero.");
  return n;
}

function assertPrice(p: unknown): number {
  const n = Number(p);
  if (!Number.isFinite(n) || n < 0) throw new AppError("Price must be zero or more.");
  return n;
}

function assertDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new AppError("Invalid trade date.");
  if (d > today()) throw new AppError("Trade date can't be in the future.");
  return d;
}

/** Assert the account exists and belongs to the caller (RLS-scoped read). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOwnsAccount(supabase: any, accountId: string): Promise<void> {
  const { data } = await supabase.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!data) throw new AppError("You don't have access to this account.");
}

type OwnedTrade = {
  id: string;
  account_id: string;
  isin: string;
  stock_id: string | null;
  symbol: string;
  trade_date: string;
  trade_type: "buy" | "sell";
  quantity: number | string;
  price: number | string;
  source: "zerodha" | "manual";
  original: unknown | null;
};

/** Load a single trade the caller owns (RLS-scoped) or throw. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadOwnedTrade(supabase: any, tradeId: string): Promise<OwnedTrade> {
  const { data } = await supabase
    .from("trades")
    .select("id, account_id, isin, stock_id, symbol, trade_date, trade_type, quantity, price, source, original")
    .eq("id", tradeId)
    .maybeSingle();
  if (!data) throw new AppError("You don't have access to this trade.");
  return data as OwnedTrade;
}

/**
 * Add a manual trade (buy or sell) that FIFO treats like any imported trade.
 * Used to backfill missing buys (opening lots) or record off-tradebook activity.
 * Given a synthetic broker_trade_id it never collides with a tradebook reimport.
 */
export async function addManualTrade(input: {
  accountId: string;
  isin: string;
  stockId?: string | null;
  symbol: string;
  trade_type: "buy" | "sell";
  quantity: number;
  price: number;
  trade_date: string;
}): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const quantity = assertQty(input.quantity);
    const price = assertPrice(input.price);
    const trade_date = assertDate(input.trade_date);
    if (input.trade_type !== "buy" && input.trade_type !== "sell") {
      throw new AppError("Trade type must be buy or sell.");
    }
    if (!input.isin || !input.symbol) throw new AppError("Stock is required.");
    await assertOwnsAccount(supabase, input.accountId);

    // Resolve canonical stock_id: prefer the supplied id, else look it up by ISIN.
    let stockId = input.stockId ?? null;
    if (!stockId) {
      const { data: s } = await supabase
        .from("indian_stocks")
        .select("id")
        .eq("isin", input.isin)
        .maybeSingle();
      stockId = (s?.id as string | undefined) ?? null;
    }

    const admin = createAdminClient();
    const { error } = await admin.from("trades").insert({
      user_id: user.id,
      account_id: input.accountId,
      symbol: input.symbol,
      isin: input.isin,
      stock_id: stockId,
      trade_date,
      trade_type: input.trade_type,
      quantity,
      price,
      source: "manual",
      broker_trade_id: `manual-${crypto.randomUUID()}`,
    });
    if (error) throw new AppError(error.message);

    await recomputeFifoForAccount(admin, user.id, input.accountId);
  });
}

/**
 * Edit a trade's quantity / price / date. For an imported (zerodha) row the raw
 * values are snapshotted into `original` on first edit so they can be restored.
 */
export async function updateTrade(input: {
  tradeId: string;
  quantity?: number;
  price?: number;
  trade_date?: string;
}): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const trade = await loadOwnedTrade(supabase, input.tradeId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upd: Record<string, any> = {};
    if (input.quantity !== undefined) upd.quantity = assertQty(input.quantity);
    if (input.price !== undefined) upd.price = assertPrice(input.price);
    if (input.trade_date !== undefined) upd.trade_date = assertDate(input.trade_date);
    if (Object.keys(upd).length === 0) throw new AppError("Nothing to update.");

    // Snapshot the broker row's original values on first override.
    if (trade.source === "zerodha" && trade.original == null) {
      upd.original = {
        quantity: Number(trade.quantity),
        price: Number(trade.price),
        trade_date: trade.trade_date,
        trade_type: trade.trade_type,
      };
    }

    const admin = createAdminClient();
    const { error } = await admin.from("trades").update(upd).eq("id", trade.id);
    if (error) throw new AppError(error.message);
    await recomputeFifoForAccount(admin, user.id, trade.account_id);
  });
}

/**
 * Remove trades. Manual rows are hard-deleted; imported (zerodha) rows are
 * soft-excluded (hidden from FIFO but the row persists so a reimport can't
 * resurrect them). Accepts a set of ids so a collapsed display lot (many fills)
 * can be removed in one call.
 */
export async function deleteTrades(input: { tradeIds: string[] }): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    if (!input.tradeIds?.length) throw new AppError("No trades to delete.");

    const admin = createAdminClient();
    const affectedAccounts = new Set<string>();
    for (const id of input.tradeIds) {
      const trade = await loadOwnedTrade(supabase, id); // ownership gate per row
      affectedAccounts.add(trade.account_id);
      if (trade.source === "manual") {
        const { error } = await admin.from("trades").delete().eq("id", id);
        if (error) throw new AppError(error.message);
      } else {
        const { error } = await admin.from("trades").update({ excluded: true }).eq("id", id);
        if (error) throw new AppError(error.message);
      }
    }
    for (const acct of affectedAccounts) {
      await recomputeFifoForAccount(admin, user.id, acct);
    }
  });
}

/** Restore an edited broker trade to its imported values. */
export async function resetTradeToOriginal(tradeId: string): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const trade = await loadOwnedTrade(supabase, tradeId);
    const orig = trade.original as
      | { quantity: number; price: number; trade_date: string; trade_type: "buy" | "sell" }
      | null;
    if (orig == null) throw new AppError("This trade hasn't been edited.");

    const admin = createAdminClient();
    const { error } = await admin
      .from("trades")
      .update({
        quantity: orig.quantity,
        price: orig.price,
        trade_date: orig.trade_date,
        trade_type: orig.trade_type,
        original: null,
      })
      .eq("id", tradeId);
    if (error) throw new AppError(error.message);
    await recomputeFifoForAccount(admin, user.id, trade.account_id);
  });
}

/**
 * Sell an open position (all or partial) from one account by recording a manual
 * sell. FIFO consumes oldest lots first on recompute. Rejects selling more than
 * the account's current open quantity for the stock.
 */
export async function sellPosition(input: {
  isin: string;
  accountId: string;
  quantity: number;
  price: number;
  trade_date: string;
}): Promise<ActionResult> {
  return action(async () => {
    const { user, supabase } = await getAuthUser();
    const quantity = assertQty(input.quantity);
    const price = assertPrice(input.price);
    const trade_date = assertDate(input.trade_date);
    await assertOwnsAccount(supabase, input.accountId);

    // Open quantity for this (account, isin) after FIFO + corporate actions.
    const ca = await loadCorporateActionContext(supabase);
    const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("trades")
        .select("id, user_id, account_id, isin, stock_id, symbol, trade_date, trade_type, quantity, price, executed_at, broker_trade_id")
        .eq("account_id", input.accountId)
        .eq("isin", input.isin)
        .eq("excluded", false)
        .order("id", { ascending: true })
        .range(from, to)
    );
    const trades: TradeForOpenPositions[] = rows.map((r) => ({
      id: r.id as string,
      user_id: r.user_id as string,
      account_id: r.account_id as string,
      isin: r.isin as string,
      stock_id: (r.stock_id as string | null) ?? null,
      symbol: (r.symbol as string) ?? "",
      trade_date: r.trade_date as string,
      trade_type: r.trade_type as "buy" | "sell",
      quantity: Number(r.quantity),
      price: Number(r.price),
      executed_at: (r.executed_at as string | null) ?? null,
      broker_trade_id: (r.broker_trade_id as string) ?? "",
    }));
    const openQty = deriveRemainingLots(trades, ca).reduce((s, l) => s + l.remaining_qty, 0);
    if (openQty <= QTY_EPS) throw new AppError("No open position to sell.");
    if (quantity > openQty + QTY_EPS) {
      throw new AppError(`Sell quantity exceeds open position (${openQty}).`);
    }

    const rep = trades.find((t) => t.trade_type === "buy") ?? trades[0];
    const symbol = rep?.symbol || input.isin;
    const stockId = rep?.stock_id ?? null;

    const admin = createAdminClient();
    const { error } = await admin.from("trades").insert({
      user_id: user.id,
      account_id: input.accountId,
      symbol,
      isin: input.isin,
      stock_id: stockId,
      trade_date,
      trade_type: "sell",
      quantity,
      price,
      source: "manual",
      broker_trade_id: `manual-${crypto.randomUUID()}`,
    });
    if (error) throw new AppError(error.message);
    await recomputeFifoForAccount(admin, user.id, input.accountId);
  });
}
