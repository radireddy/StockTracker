"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { fetchStockPrice } from "@/app/(authenticated)/actions/price-actions";
import { revalidatePath } from "next/cache";
import DOMPurify from "isomorphic-dompurify";
import { createLogger } from "@/lib/logger";
import { companyCreateSchema } from "@/lib/validations";
import { action, AppError, describeDbError, type ActionResult } from "@/lib/action-result";

const log = createLogger({ service: "company-actions" });

function sanitizeHtml(html: string | null): string | null {
  if (!html) return null;
  return DOMPurify.sanitize(html);
}

/**
 * Lightweight company fetch for the initial company-page render (header +
 * Details tab). Deliberately excludes heavy columns/relations — thesis &
 * highlights HTML, timeline_entries, financial_years, segment_valuations,
 * market_perceptions — which the corresponding tabs lazy-fetch on first open.
 * Mirrors the dashboard's select (+ sector + portfolio_id/isin/expected_returns)
 * so the page renders in tens of ms instead of seconds.
 */
export async function getCompanyCore(id: string) {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("companies")
    .select(`
      id, portfolio_id, isin, buy_price, star_rating, strategy,
      investment_horizon_years, expected_returns,
      indian_stocks(name, nse_symbol, price, market_cap, sector),
      projection_models(id, is_default, valuation_scenarios(scenario_type, target_market_cap, irr, buy_price))
    `)
    .eq("id", id)
    .single();

  if (error) {
    log.error("getCompanyCore failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  return data;
}

/** Thesis HTML for the Thesis tab (lazy-fetched on first open). */
export async function getCompanyThesis(id: string): Promise<string | null> {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("companies")
    .select("thesis")
    .eq("id", id)
    .single();

  if (error) {
    log.error("getCompanyThesis failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  return data?.thesis ?? null;
}

export async function createCompany(formData: FormData): Promise<ActionResult<string>> {
  return action(async () => {
    const { supabase, user } = await getAuthUser();

    const parsed = companyCreateSchema.safeParse({
      portfolio_id: formData.get("portfolio_id"),
      isin: formData.get("isin"),
      strategy: formData.get("strategy") || undefined,
      investment_horizon_years: formData.get("investment_horizon_years") ? Number(formData.get("investment_horizon_years")) : undefined,
      star_rating: formData.get("star_rating") ? Number(formData.get("star_rating")) : undefined,
      buy_price: formData.get("buy_price") ? Number(formData.get("buy_price")) : undefined,
    });
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, "Correct the highlighted fields and try again.");
    }

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
      throw error.code === "23505"
        ? new AppError(
            "This stock is already in this portfolio.",
            "Open the existing entry to edit it, or choose a different portfolio."
          )
        : describeDbError(error, "Couldn't add the company.");
    }

    const isin = formData.get("isin") as string;
    await fetchStockPrice(isin);

    revalidatePath("/");
    log.info("Company created", { isin });
    return newCompany!.id;
  });
}

export async function updateCompany(id: string, data: Record<string, unknown>) {
  const { supabase, user } = await getAuthUser();

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
  const { supabase, user } = await getAuthUser();

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) {
    log.error("deleteCompany failed", { error: error.message, companyId: id });
    throw new Error(error.message);
  }
  revalidatePath("/");
  log.info("Company deleted", { companyId: id });
}


export async function getCompanyHighlights(id: string): Promise<string | null> {
  const { supabase, user } = await getAuthUser();

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
  const { supabase, user } = await getAuthUser();

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
    notes?: string;
    position?: {
      account_id?: string;
      new_account_label?: string;
      quantity?: number;
      avg_buy_price?: number;
    };
  }
): Promise<ActionResult<string>> {
  return action(async () => {
    const { supabase } = await getAuthUser();

    // The whole move — insert the target company, reconcile holdings (creating the
    // account if needed), deep-copy every research child record, then delete the
    // source — runs inside a single `move_company` Postgres transaction. Either it
    // all commits or it all rolls back, so a mid-way failure can no longer leave a
    // half-copied company alongside a deleted original. The RPC also owns the
    // account-required and duplicate-stock checks, surfacing them as errors.
    const p = additionalData?.position;
    const { data: newCompanyId, error } = await supabase.rpc("move_company", {
      p_company_id: companyId,
      p_target_portfolio_id: targetPortfolioId,
      p_notes: additionalData?.notes ?? null,
      p_account_id: p?.account_id ?? null,
      p_new_account_label: p?.new_account_label ?? null,
      p_quantity: p?.quantity ?? null,
      p_avg_buy_price: p?.avg_buy_price ?? null,
    });

    if (error) {
      log.error("moveCompany failed", { error: error.message, companyId, targetPortfolioId });
      // The RPC raises its own human-readable messages (duplicate stock, account
      // required, …), so preserve the message rather than masking it.
      throw new AppError(error.message, "Check the target portfolio and account, then try again.");
    }

    revalidatePath("/");
    return newCompanyId as string;
  });
}
