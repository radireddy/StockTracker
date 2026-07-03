"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { holdingSchema, companyWithHoldingSchema } from "@/lib/validations";
import { fetchStockPrice } from "@/app/(authenticated)/actions/price-actions";
import { combineHoldingLots } from "@/lib/holdings";
import { resolveAccountId } from "@/lib/accounts";
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
 * Manually add a holding (a buy) for a stock in a specific account. If the
 * account already holds this stock, the new lot is accumulated — quantities
 * add up and the average buy price becomes the cost-weighted average — rather
 * than overwriting the existing position. Always account-scoped. Creates the
 * company research stub if missing.
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

  // Accumulate onto any existing lot for this account+company (a new buy),
  // rather than replacing it.
  const { data: current } = await supabase
    .from("holdings")
    .select("quantity, avg_buy_price")
    .eq("portfolio_id", portfolioId)
    .eq("account_id", input.account_id)
    .eq("company_id", companyId)
    .maybeSingle();

  const combined = current
    ? combineHoldingLots(current, { quantity: input.quantity, avg_buy_price: input.avg_buy_price })
    : { quantity: input.quantity, avg_buy_price: input.avg_buy_price };

  const { error } = await supabase.from("holdings").upsert(
    {
      user_id: user.id,
      portfolio_id: portfolioId,
      account_id: input.account_id,
      company_id: companyId,
      isin: input.isin,
      quantity: combined.quantity,
      avg_buy_price: combined.avg_buy_price,
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

/**
 * Add a company to a portfolio, optionally with a holding position.
 * Research-only, position-only, and both are all valid. When a `+New`
 * account label is given, the account is created first. Duplicate stocks
 * in the same portfolio are rejected before anything is created.
 */
export async function createCompanyWithHolding(formData: FormData): Promise<string> {
  const { supabase, user } = await getAuthUser();

  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : undefined);
  const str = (k: string) => (formData.get(k) as string) || undefined;

  const parsed = companyWithHoldingSchema.safeParse({
    portfolio_id: formData.get("portfolio_id"),
    isin: formData.get("isin"),
    strategy: str("strategy"),
    investment_horizon_years: num("investment_horizon_years"),
    star_rating: num("star_rating"),
    buy_price: num("buy_price"),
    account_id: str("account_id"),
    new_account_label: str("new_account_label"),
    quantity: num("quantity"),
    avg_buy_price: num("avg_buy_price"),
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const d = parsed.data;

  // 1. Reject duplicate stock in this portfolio.
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("portfolio_id", d.portfolio_id)
    .eq("isin", d.isin)
    .maybeSingle();
  if (existing) throw new Error("This stock is already in this portfolio.");

  // 2. Resolve the account (create it if a new label was given).
  const accountId = await resolveAccountId(supabase, user.id, {
    account_id: d.account_id,
    new_account_label: d.new_account_label,
  });

  // 3. Insert the company (research stub; defaults applied).
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .insert({
      user_id: user.id,
      portfolio_id: d.portfolio_id,
      isin: d.isin,
      buy_price: d.buy_price ?? null,
      star_rating: d.star_rating ?? 2,
      strategy: (d.strategy as "core" | "satellite" | null) ?? null,
      investment_horizon_years: d.investment_horizon_years ?? 0,
    })
    .select("id")
    .single();
  if (compErr || !company) {
    throw new Error(
      compErr?.code === "23503"
        ? "That stock is not in the database yet. Import a statement containing it first."
        : compErr?.message ?? "Failed to create company"
    );
  }

  // 4. Insert the holding. Account is guaranteed; quantity and avg price are
  //    optional (default to 0) and can be filled in later on the Holdings tab.
  const { error: holdErr } = await supabase.from("holdings").insert({
    user_id: user.id,
    portfolio_id: d.portfolio_id,
    account_id: accountId,
    company_id: company.id,
    isin: d.isin,
    quantity: d.quantity ?? 0,
    avg_buy_price: d.avg_buy_price ?? 0,
    source: "manual",
    import_holding_id: null,
  });
  if (holdErr) throw new Error(holdErr.message);

  await fetchStockPrice(d.isin);
  revalidatePath("/");
  log.info("Company created with holding", { isin: d.isin });
  return company.id;
}
