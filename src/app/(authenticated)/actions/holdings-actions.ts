"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { holdingSchema } from "@/lib/validations";
import type { Holding } from "@/types/database";

const log = createLogger({ service: "holdings-actions" });

/** Holdings for one company, broken down per account (for the detail page). */
export async function getHoldingsForCompany(companyId: string): Promise<Holding[]> {
  const { supabase } = await getAuthUser();
  const { data, error } = await supabase
    .from("holdings")
    .select("*, accounts(id, label, broker)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    log.error("getHoldingsForCompany failed", { error: error.message, companyId });
    throw new Error(error.message);
  }
  return data as Holding[];
}

/**
 * Manually add (or overwrite) a holding for a stock in a specific account.
 * Always account-scoped. Creates the company research stub if missing.
 */
export async function addHolding(
  portfolioId: string,
  input: { account_id: string; isin: string; quantity: number; avg_buy_price: number }
): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const parsed = holdingSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  // Resolve or create the company (research stub) for this ISIN in the portfolio.
  let companyId: string;
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("isin", input.isin)
    .maybeSingle();

  if (existing) {
    companyId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("companies")
      .insert({ user_id: user.id, portfolio_id: portfolioId, isin: input.isin })
      .select("id")
      .single();
    if (createErr) {
      log.error("addHolding: company create failed", { error: createErr.message, isin: input.isin });
      throw new Error(
        createErr.code === "23503"
          ? "That stock is not in the database yet. Import a statement containing it first."
          : createErr.message
      );
    }
    companyId = created!.id;
  }

  const { error } = await supabase.from("holdings").upsert(
    {
      user_id: user.id,
      portfolio_id: portfolioId,
      account_id: input.account_id,
      company_id: companyId,
      isin: input.isin,
      quantity: input.quantity,
      avg_buy_price: input.avg_buy_price,
      source: "manual",
      import_holding_id: null,
    },
    { onConflict: "portfolio_id,account_id,company_id" }
  );

  if (error) {
    log.error("addHolding failed", { error: error.message });
    throw new Error(error.message);
  }
  revalidatePath("/");
}

/** Edit quantity / average price of an existing holding. */
export async function updateHolding(
  id: string,
  input: { quantity?: number; avg_buy_price?: number }
): Promise<void> {
  const { supabase } = await getAuthUser();

  const updateData: Record<string, number | string> = { source: "manual" };
  if (input.quantity !== undefined) {
    if (input.quantity <= 0) throw new Error("Quantity must be positive");
    updateData.quantity = input.quantity;
  }
  if (input.avg_buy_price !== undefined) {
    if (input.avg_buy_price < 0) throw new Error("Average price cannot be negative");
    updateData.avg_buy_price = input.avg_buy_price;
  }

  const { error } = await supabase.from("holdings").update(updateData).eq("id", id);
  if (error) {
    log.error("updateHolding failed", { error: error.message, id });
    throw new Error(error.message);
  }
  revalidatePath("/");
}

/** Remove a single holding (a stock in one account). */
export async function deleteHolding(id: string): Promise<void> {
  const { supabase } = await getAuthUser();
  const { error } = await supabase.from("holdings").delete().eq("id", id);
  if (error) {
    log.error("deleteHolding failed", { error: error.message, id });
    throw new Error(error.message);
  }
  revalidatePath("/");
}
