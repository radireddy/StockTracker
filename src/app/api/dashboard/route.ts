import { NextRequest, NextResponse } from "next/server";
import { getAuthUserOrNull } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices, isIndianTradingHours } from "@/lib/services/price-refresh";
import { createLogger } from "@/lib/logger";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { dashboardQuerySchema } from "@/lib/validations";
import type { SupabaseClient } from "@supabase/supabase-js";

const log = createLogger({ service: "api-dashboard" });

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
let refreshInProgress = false;

const DASHBOARD_COMPANY_SELECT = `
  id, isin, star_rating, strategy, buy_price, investment_horizon_years,
  indian_stocks(name, nse_symbol, price, market_cap),
  projection_models(is_default, valuation_scenarios(scenario_type, target_market_cap, irr, buy_price))
`;

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(user.id, RATE_LIMITS.dashboard);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const { searchParams } = request.nextUrl;
  const parsed = dashboardQuerySchema.safeParse({
    portfolioId: searchParams.get("portfolioId"),
    portfolioType: searchParams.get("portfolioType"),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { portfolioId } = parsed.data;

  const companyQuery = supabase
    .from("companies")
    .select(DASHBOARD_COMPANY_SELECT)
    .eq("portfolio_id", portfolioId);

  const [companiesResult, accountsResult, holdingsResult, profileResult] = await Promise.all([
    companyQuery.order("created_at"),
    supabase
      .from("accounts")
      .select("id, label, broker")
      .order("created_at", { ascending: true }),
    supabase
      .from("holdings")
      .select("company_id, account_id, quantity, avg_buy_price")
      .eq("portfolio_id", portfolioId),
    supabase
      .from("profiles")
      .select("allocation_ranges")
      .eq("id", user.id)
      .single(),
  ]);

  if (companiesResult.error) {
    log.error("dashboard companies failed", { error: companiesResult.error.message, portfolioId });
    return NextResponse.json({ error: companiesResult.error.message }, { status: 500 });
  }
  if (accountsResult.error) {
    log.error("dashboard accounts failed", { error: accountsResult.error.message });
    return NextResponse.json({ error: accountsResult.error.message }, { status: 500 });
  }
  if (holdingsResult.error) {
    log.error("dashboard holdings failed", { error: holdingsResult.error.message });
    return NextResponse.json({ error: holdingsResult.error.message }, { status: 500 });
  }

  const companies = companiesResult.data ?? [];
  const accounts = accountsResult.data ?? [];
  const allHoldings = (holdingsResult.data ?? []).map((h) => ({
    company_id: h.company_id as string,
    account_id: h.account_id as string,
    quantity: (h.quantity as number) ?? 0,
    avg_buy_price: h.avg_buy_price as number | null,
  }));

  type DashboardStock = { name: string | null; nse_symbol: string | null; price: number | null; market_cap: number | null };
  type DashboardProjectionModel = { is_default: boolean; valuation_scenarios: { scenario_type: string; target_market_cap: number | null; irr: number | null; buy_price: number | null }[] };

  const normalized = companies.map((c) => ({
    ...c,
    indian_stocks: (c.indian_stocks as unknown as DashboardStock | null) ?? null,
    projection_models: ((c.projection_models ?? []) as unknown as DashboardProjectionModel[]),
  }));

  // Fire-and-forget price refresh if stale
  triggerPriceRefreshIfStale(supabase);

  const allocationRanges =
    (profileResult.data?.allocation_ranges as Record<string, { min: number; max: number }> | null) ?? null;

  return NextResponse.json({ companies: normalized, accounts, allHoldings, allocationRanges });
}

async function triggerPriceRefreshIfStale(supabase: SupabaseClient) {
  if (!isIndianTradingHours() || refreshInProgress) return;

  try {
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
  } catch {
    // staleness check failed — skip refresh
  }
}
