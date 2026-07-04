"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { portfolioSchema } from "@/lib/validations";
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
): Promise<{ companies: number; holdings: number }> {
  const { supabase, user } = await getAuthUser();

  // Both counts are computed DB-side and scoped by portfolio_id (RLS also
  // scopes to the caller). Holdings carry their own portfolio_id, so there is
  // no need to fetch every company id into JS to fan out the count.
  const [companyResult, holdingResult] = await Promise.all([
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("portfolio_id", id),
    supabase
      .from("holdings")
      .select("*", { count: "exact", head: true })
      .eq("portfolio_id", id),
  ]);

  if (companyResult.error) {
    log.error("getPortfolioDeletionSummary: companies count failed", {
      error: companyResult.error.message,
      id,
    });
    throw new Error(companyResult.error.message);
  }
  if (holdingResult.error) {
    log.error("getPortfolioDeletionSummary: holdings count failed", {
      error: holdingResult.error.message,
      id,
    });
    throw new Error(holdingResult.error.message);
  }

  return {
    companies: companyResult.count ?? 0,
    holdings: holdingResult.count ?? 0,
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

  const parsed = portfolioSchema.safeParse({ name: input.name, type: input.type });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  // These three reads are independent, so run them together. The portfolio
  // count is fetched once and reused for both the plan-limit check and the
  // is-first-portfolio (default) decision.
  const [
    { data: profile },
    { count: portfolioCount },
    { data: lastPortfolio },
  ] = await Promise.all([
    supabase.from("profiles").select("plan_limits").eq("id", user.id).single(),
    supabase.from("portfolios").select("*", { count: "exact", head: true }),
    supabase
      .from("portfolios")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const currentCount = portfolioCount ?? 0;

  // Check plan limits
  if (profile?.plan_limits) {
    const limits = profile.plan_limits as { max_portfolios?: number };
    if (limits.max_portfolios != null && currentCount >= limits.max_portfolios) {
      throw new Error(
        `Portfolio limit reached (${limits.max_portfolios}). Upgrade your plan to create more.`
      );
    }
  }

  const nextSortOrder = (lastPortfolio?.sort_order ?? -1) + 1;
  const isFirst = currentCount === 0;

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
