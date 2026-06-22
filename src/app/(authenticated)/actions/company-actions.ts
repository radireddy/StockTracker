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

export async function getCompanies(portfolioId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let query = supabase
    .from("companies")
    .select("*, indian_stocks(*), projection_models(*, valuation_scenarios(*))")
    .order("created_at");

  if (portfolioId) {
    query = query.eq("portfolio_id", portfolioId);
  }

  const { data, error } = await query;
  if (error) {
    log.error("getCompanies failed", { error: error.message, portfolioId });
    throw new Error(error.message);
  }
  return data;
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

  const { error } = await supabase.from("companies").insert({
    user_id: user.id,
    portfolio_id: formData.get("portfolio_id") as string,
    isin: formData.get("isin") as string,
    buy_price: formData.get("buy_price") ? Number(formData.get("buy_price")) : null,
    star_rating: Number(formData.get("star_rating")) || 2,
    strategy: formData.get("strategy") as "core" | "satellite" | null,
    investment_horizon_years: formData.get("investment_horizon_years") ? Number(formData.get("investment_horizon_years")) : 0,
    thesis: sanitizeHtml(formData.get("thesis") as string | null),
    highlights: sanitizeHtml(formData.get("highlights") as string | null),
  });

  if (error) {
    log.error("createCompany failed", { error: error.message });
    throw new Error(error.message);
  }

  const isin = formData.get("isin") as string;
  await fetchStockPrice(isin);

  revalidatePath("/");
  log.info("Company created", { isin });
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
    .from("indian_stocks")
    .select("isin, price, market_cap");

  if (error) {
    log.error("getLivePrices failed", { error: error.message });
    throw new Error(error.message);
  }

  const map: Record<string, { price: number | null; market_cap: number | null }> = {};
  for (const row of data ?? []) {
    map[row.isin] = { price: row.price, market_cap: row.market_cap };
  }
  return map;
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
