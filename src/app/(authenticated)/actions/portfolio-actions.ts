"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import type { Portfolio } from "@/types/database";

const log = createLogger({ service: "portfolio-actions" });

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export async function getPortfolios(): Promise<
  (Portfolio & { company_count: number })[]
> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("portfolios")
    .select("*, companies(count)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    log.error("getPortfolios failed", { error: error.message });
    throw new Error(error.message);
  }

  const portfolios = (data ?? []).map((p) => {
    const { companies, ...portfolio } = p as Portfolio & {
      companies: { count: number }[];
    };
    return {
      ...portfolio,
      company_count: companies?.[0]?.count ?? 0,
    };
  });

  // Bootstrap: first login — create a default portfolio
  if (portfolios.length === 0) {
    const { data: newPortfolio, error: createError } = await supabase
      .from("portfolios")
      .insert({
        user_id: user.id,
        name: "My Portfolio",
        type: "holdings",
        is_default: true,
        sort_order: 0,
      })
      .select("*, companies(count)")
      .single();

    if (createError) {
      log.error("getPortfolios: bootstrap create failed", { error: createError.message });
      throw new Error(createError.message);
    }

    const { companies: c, ...p } = newPortfolio as Portfolio & { companies: { count: number }[] };
    log.info("Default portfolio created on first login");
    return [{ ...p, company_count: 0 }];
  }

  // Ensure exactly one portfolio is marked default
  if (!portfolios.some((p) => p.is_default)) {
    await supabase
      .from("portfolios")
      .update({ is_default: true })
      .eq("id", portfolios[0].id);
    portfolios[0].is_default = true;
  }

  return portfolios;
}

export async function getPortfolio(id: string): Promise<Portfolio | null> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    log.error("getPortfolio failed", { error: error.message, id });
    throw new Error(error.message);
  }

  return data as Portfolio;
}

export async function getPortfolioDeletionSummary(
  id: string
): Promise<{ companies: number; transactions: number }> {
  const { supabase, user } = await getAuthUser();

  // Count companies in portfolio
  const { count: companyCount, error: companyError } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("portfolio_id", id);

  if (companyError) {
    log.error("getPortfolioDeletionSummary: companies count failed", {
      error: companyError.message,
      id,
    });
    throw new Error(companyError.message);
  }

  // Get company IDs for transaction count
  const { data: companyIds } = await supabase
    .from("companies")
    .select("id")
    .eq("portfolio_id", id);

  let transactionCount = 0;
  if (companyIds && companyIds.length > 0) {
    const ids = companyIds.map((c) => c.id);
    const { count, error: txError } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .in("company_id", ids);

    if (txError) {
      log.error("getPortfolioDeletionSummary: transactions count failed", {
        error: txError.message,
        id,
      });
      throw new Error(txError.message);
    }
    transactionCount = count ?? 0;
  }

  return {
    companies: companyCount ?? 0,
    transactions: transactionCount,
  };
}

// ---------------------------------------------------------------------------
// Write functions
// ---------------------------------------------------------------------------

export async function createPortfolio(input: {
  name: string;
  type: Portfolio["type"];
  description?: string;
  color?: string;
  icon?: string;
}): Promise<Portfolio> {
  const { supabase, user } = await getAuthUser();

  // Check plan limits
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan_limits")
    .eq("id", user.id)
    .single();

  if (profile?.plan_limits) {
    const limits = profile.plan_limits as { max_portfolios?: number };
    if (limits.max_portfolios != null) {
      const { count } = await supabase
        .from("portfolios")
        .select("*", { count: "exact", head: true });

      if (count != null && count >= limits.max_portfolios) {
        throw new Error(
          `Portfolio limit reached (${limits.max_portfolios}). Upgrade your plan to create more.`
        );
      }
    }
  }

  // Get next sort_order
  const { data: lastPortfolio } = await supabase
    .from("portfolios")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = (lastPortfolio?.sort_order ?? -1) + 1;

  // Check if this is the first portfolio (should be default)
  const { count: existingCount } = await supabase
    .from("portfolios")
    .select("*", { count: "exact", head: true });

  const isFirst = (existingCount ?? 0) === 0;

  const { data, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sort_order: nextSortOrder,
      is_default: isFirst,
    })
    .select("*")
    .single();

  if (error) {
    log.error("createPortfolio failed", { error: error.message, name: input.name });
    throw new Error(error.message);
  }

  revalidatePath("/");
  log.info("Portfolio created", { name: input.name, id: data!.id });
  return data as Portfolio;
}

export async function updatePortfolio(
  id: string,
  input: {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
  }
): Promise<Portfolio> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("portfolios")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    log.error("updatePortfolio failed", { error: error.message, id });
    throw new Error(error.message);
  }

  revalidatePath("/");
  log.info("Portfolio updated", { id });
  return data as Portfolio;
}

export async function setDefaultPortfolio(id: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Unset all current defaults for this user
  const { error: unsetError } = await supabase
    .from("portfolios")
    .update({ is_default: false })
    .eq("is_default", true);

  if (unsetError) {
    log.error("setDefaultPortfolio: unset failed", {
      error: unsetError.message,
    });
    throw new Error(unsetError.message);
  }

  // Set new default
  const { error: setError } = await supabase
    .from("portfolios")
    .update({ is_default: true })
    .eq("id", id);

  if (setError) {
    log.error("setDefaultPortfolio: set failed", { error: setError.message });
    throw new Error(setError.message);
  }

  revalidatePath("/");
  log.info("Default portfolio set", { id });
}

export async function deletePortfolio(id: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Fetch the portfolio to check guards
  const { data: portfolio, error: fetchError } = await supabase
    .from("portfolios")
    .select("id, is_default")
    .eq("id", id)
    .single();

  if (fetchError || !portfolio) {
    throw new Error("Portfolio not found");
  }

  if (portfolio.is_default) {
    throw new Error("Cannot delete the default portfolio. Set another portfolio as default first.");
  }

  // Check it's not the last portfolio
  const { count } = await supabase
    .from("portfolios")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) <= 1) {
    throw new Error("Cannot delete your last portfolio.");
  }

  const { error } = await supabase
    .from("portfolios")
    .delete()
    .eq("id", id);

  if (error) {
    log.error("deletePortfolio failed", { error: error.message, id });
    throw new Error(error.message);
  }

  revalidatePath("/");
  log.info("Portfolio deleted", { id });
}

export async function reorderPortfolios(orderedIds: string[]): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Batch update sort_order by index position
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("portfolios")
      .update({ sort_order: index })
      .eq("id", id)
  );

  const results = await Promise.all(updates);

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    log.error("reorderPortfolios failed", { error: failed.error.message });
    throw new Error(failed.error.message);
  }

  revalidatePath("/");
  log.info("Portfolios reordered", { count: orderedIds.length });
}
