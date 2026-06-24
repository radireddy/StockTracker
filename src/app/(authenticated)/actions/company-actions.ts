"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices, isIndianTradingHours } from "@/lib/services/price-refresh";
import { fetchStockPrice } from "@/app/(authenticated)/actions/price-actions";
import { revalidatePath } from "next/cache";
import DOMPurify from "isomorphic-dompurify";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "company-actions" });

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
let refreshInProgress = false;

function sanitizeHtml(html: string | null): string | null {
  if (!html) return null;
  return DOMPurify.sanitize(html);
}

export async function getCompanies(
  portfolioId: string,
  options?: { includeExited?: boolean }
) {
  const supabase = await createClient();

  // Check portfolio type to apply correct filter
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("type")
    .eq("id", portfolioId)
    .single();

  let query = supabase
    .from("companies")
    .select("*, indian_stocks(*), projection_models(*, valuation_scenarios(*))")
    .eq("portfolio_id", portfolioId);

  // For holdings portfolios, filter out fully sold stocks (quantity = 0)
  // quantity null = manually added (no trades yet) → show
  // quantity > 0  = active holding → show
  // quantity = 0  = fully exited → hide by default
  if (portfolio?.type === "holdings" && !options?.includeExited) {
    query = query.or("quantity.is.null,quantity.gt.0");
  }

  const { data, error } = await query.order("created_at");

  if (error) {
    log.error("getCompanies failed", { error: error.message, portfolioId });
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      indian_stocks(*),
      projection_models(*, financial_years(*), valuation_scenarios(*)),
      timeline_entries(*),
      segment_valuations(*),
      market_perceptions(*)
    `)
    .eq("id", id)
    .single();

  if (error) {
    log.error("getCompany failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  return data;
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: newCompany, error } = await supabase.from("companies").insert({
    user_id: user.id,
    portfolio_id: formData.get("portfolio_id") as string,
    isin: formData.get("isin") as string,
    buy_price: formData.get("buy_price") ? Number(formData.get("buy_price")) : null,
    star_rating: Number(formData.get("star_rating")) || 2,
    strategy: formData.get("strategy") as "core" | "satellite" | null,
    investment_horizon_years: formData.get("investment_horizon_years") ? Number(formData.get("investment_horizon_years")) : 0,
    thesis: sanitizeHtml(formData.get("thesis") as string | null),
    highlights: sanitizeHtml(formData.get("highlights") as string | null),
  }).select("id").single();

  if (error) {
    log.error("createCompany failed", { error: error.message });
    throw new Error(error.message);
  }

  const isin = formData.get("isin") as string;
  await fetchStockPrice(isin);

  revalidatePath("/");
  log.info("Company created", { isin });
  return newCompany!.id;
}

export async function updateCompany(id: string, data: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (data.thesis) data.thesis = sanitizeHtml(data.thesis as string);
  if (data.highlights) data.highlights = sanitizeHtml(data.highlights as string);

  const { error } = await supabase
    .from("companies")
    .update(data)
    .eq("id", id);

  if (error) {
    log.error("updateCompany failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  revalidatePath(`/company/${id}`);
  revalidatePath("/");
  log.info("Company updated", { companyId: id });
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) {
    log.error("deleteCompany failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  revalidatePath("/");
  log.info("Company deleted", { companyId: id });
}

export async function getLivePrices(): Promise<
  Record<string, { price: number | null; market_cap: number | null }>
> {
  const supabase = await createClient();

  // Check if prices are stale and trigger background refresh
  if (isIndianTradingHours() && !refreshInProgress) {
    const { data: staleness } = await supabase
      .from("indian_stocks")
      .select("last_updated")
      .order("last_updated", { ascending: true })
      .limit(1)
      .single();

    const lastUpdated = staleness?.last_updated
      ? new Date(staleness.last_updated).getTime()
      : 0;
    const isStale = Date.now() - lastUpdated > STALE_THRESHOLD_MS;

    if (isStale) {
      refreshInProgress = true;
      const adminClient = createAdminClient();
      refreshPrices(adminClient)
        .then((result) => {
          log.info("Auto-refresh completed", result);
        })
        .catch((err) => {
          log.error("Auto-refresh failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          refreshInProgress = false;
        });
    }
  }

  const { data, error } = await supabase
    .from("companies")
    .select("isin, indian_stocks(isin, price, market_cap)");

  if (error) {
    log.error("getLivePrices failed", { error: error.message });
    throw new Error(error.message);
  }

  const map: Record<string, { price: number | null; market_cap: number | null }> = {};
  for (const row of data ?? []) {
    const stock = row.indian_stocks as unknown as { isin: string; price: number | null; market_cap: number | null } | null;
    if (stock) {
      map[stock.isin] = { price: stock.price, market_cap: stock.market_cap };
    }
  }
  return map;
}

export async function getCompanyHighlights(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("companies")
    .select("highlights")
    .eq("id", id)
    .single();

  if (error) {
    log.error("getCompanyHighlights failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  return data?.highlights ?? null;
}

export async function deleteAllCompanies() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("user_id", user.id);
  if (error) {
    log.error("deleteAllCompanies failed", { error: error.message });
    throw new Error(error.message);
  }
  revalidatePath("/");
  log.warn("All companies deleted by user");
}

export async function moveCompany(
  companyId: string,
  targetPortfolioId: string,
  additionalData?: {
    quantity?: number;
    avg_buy_price?: number;
    buy_date?: string;
    notes?: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 1. Fetch source company
  const { data: source, error: fetchError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (fetchError || !source) throw new Error("Company not found");

  // 2. Get target portfolio type
  const { data: targetPortfolio } = await supabase
    .from("portfolios")
    .select("type")
    .eq("id", targetPortfolioId)
    .single();

  if (!targetPortfolio) throw new Error("Target portfolio not found");

  // 3. Check for duplicate in target portfolio
  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("portfolio_id", targetPortfolioId)
    .eq("isin", source.isin)
    .maybeSingle();

  if (existing) {
    throw new Error("This stock already exists in the target portfolio.");
  }

  // 4. Insert new company in target (copy common fields)
  const isWatchlist = targetPortfolio.type === "watchlist";

  const { data: newCompany, error: insertError } = await supabase
    .from("companies")
    .insert({
      portfolio_id: targetPortfolioId,
      user_id: user.id,
      isin: source.isin,
      buy_price: source.buy_price,
      star_rating: source.star_rating,
      strategy: source.strategy,
      investment_horizon_years: source.investment_horizon_years,
      expected_returns: source.expected_returns,
      thesis: source.thesis,
      highlights: source.highlights,
      quantity: isWatchlist ? null : (additionalData?.quantity ?? null),
      avg_buy_price: isWatchlist
        ? null
        : (additionalData?.avg_buy_price ?? null),
      buy_date: isWatchlist ? null : (additionalData?.buy_date ?? null),
      notes: additionalData?.notes ?? null,
    })
    .select("id")
    .single();

  if (insertError || !newCompany) {
    log.error("Failed to insert company in target portfolio", { error: insertError?.message });
    throw insertError ?? new Error("Failed to move company");
  }

  // 5. Copy child records: projection_models, financial_years, valuation_scenarios
  const { data: sourceModels } = await supabase
    .from("projection_models")
    .select("*, financial_years(*), valuation_scenarios(*)")
    .eq("company_id", companyId);

  for (const model of sourceModels ?? []) {
    const { data: newModel } = await supabase
      .from("projection_models")
      .insert({
        company_id: newCompany.id,
        user_id: user.id,
        projection_type: model.projection_type,
        name: model.name,
        is_default: model.is_default,
        sort_order: model.sort_order,
      })
      .select("id")
      .single();

    if (!newModel) continue;

    if (model.financial_years?.length) {
      await supabase.from("financial_years").insert(
        model.financial_years.map((fy: Record<string, unknown>) => ({
          company_id: newCompany.id,
          projection_model_id: newModel.id,
          user_id: user.id,
          year: fy.year,
          is_estimate: fy.is_estimate,
          revenue: fy.revenue,
          revenue_growth_pct: fy.revenue_growth_pct,
          ebitda: fy.ebitda,
          ebitda_margin_pct: fy.ebitda_margin_pct,
          ebitda_growth_pct: fy.ebitda_growth_pct,
          depreciation: fy.depreciation,
          finance_cost: fy.finance_cost,
          other_income: fy.other_income,
          exceptional_items: fy.exceptional_items,
          pbt: fy.pbt,
          tax_pct: fy.tax_pct,
          pat: fy.pat,
          pat_growth_pct: fy.pat_growth_pct,
          pat_margin_pct: fy.pat_margin_pct,
          minority_interest: fy.minority_interest,
          pat_for_shareholders: fy.pat_for_shareholders,
          pe: fy.pe,
          peg: fy.peg,
          net_debt: fy.net_debt,
          lease_liability: fy.lease_liability,
          total_debt: fy.total_debt,
          ev_ebitda_ratio: fy.ev_ebitda_ratio,
          sort_order: fy.sort_order,
        }))
      );
    }

    if (model.valuation_scenarios?.length) {
      await supabase.from("valuation_scenarios").insert(
        model.valuation_scenarios.map((vs: Record<string, unknown>) => ({
          company_id: newCompany.id,
          projection_model_id: newModel.id,
          user_id: user.id,
          scenario_type: vs.scenario_type,
          target_pe: vs.target_pe,
          target_market_cap: vs.target_market_cap,
          irr: vs.irr,
          buying_market_cap: vs.buying_market_cap,
          buy_price: vs.buy_price,
          target_ev_ebitda_ratio: vs.target_ev_ebitda_ratio,
          expected_ev: vs.expected_ev,
          net_debt_terminal: vs.net_debt_terminal,
        }))
      );
    }
  }

  // Copy timeline entries
  const { data: timelineEntries } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("company_id", companyId);

  if (timelineEntries?.length) {
    await supabase.from("timeline_entries").insert(
      timelineEntries.map((te: Record<string, unknown>) => ({
        company_id: newCompany.id,
        user_id: user.id,
        quarter: te.quarter,
        entry_date: te.entry_date,
        content: te.content,
        sort_order: te.sort_order,
      }))
    );
  }

  // Copy segment valuations
  const { data: segments } = await supabase
    .from("segment_valuations")
    .select("*")
    .eq("company_id", companyId);

  if (segments?.length) {
    await supabase.from("segment_valuations").insert(
      segments.map((s: Record<string, unknown>) => ({
        company_id: newCompany.id,
        user_id: user.id,
        segment_name: s.segment_name,
        management_signal: s.management_signal,
        metrics: s.metrics,
        multiple: s.multiple,
        estimated_value: s.estimated_value,
        sort_order: s.sort_order,
      }))
    );
  }

  // Copy market perceptions
  const { data: perceptions } = await supabase
    .from("market_perceptions")
    .select("*")
    .eq("company_id", companyId);

  if (perceptions?.length) {
    await supabase.from("market_perceptions").insert(
      perceptions.map((mp: Record<string, unknown>) => ({
        company_id: newCompany.id,
        user_id: user.id,
        perception: mp.perception,
        own_view: mp.own_view,
        sort_order: mp.sort_order,
      }))
    );
  }

  // 6. Delete source company (CASCADE handles children + transactions)
  await supabase.from("companies").delete().eq("id", companyId);

  revalidatePath("/");
}
