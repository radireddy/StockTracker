import { NextRequest, NextResponse } from "next/server";
import { getAuthUserOrNull } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPrices, isIndianTradingHours } from "@/lib/services/price-refresh";
import { createLogger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

const log = createLogger({ service: "api-dashboard" });

const STALE_THRESHOLD_MS = 5 * 60 * 1000;
let refreshInProgress = false;

const DASHBOARD_COMPANY_SELECT = `
  id, isin, star_rating, strategy, quantity, avg_buy_price, buy_price, investment_horizon_years,
  indian_stocks(name, nse_symbol, price, market_cap),
  projection_models(is_default, valuation_scenarios(scenario_type, target_market_cap, irr, buy_price))
`;

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const portfolioId = searchParams.get("portfolioId");
  const portfolioType = searchParams.get("portfolioType") as "holdings" | "watchlist" | null;

  if (!portfolioId || !portfolioType) {
    return NextResponse.json({ error: "Missing portfolioId or portfolioType" }, { status: 400 });
  }

  let companyQuery = supabase
    .from("companies")
    .select(DASHBOARD_COMPANY_SELECT)
    .eq("portfolio_id", portfolioId);

  if (portfolioType === "holdings") {
    companyQuery = companyQuery.or("quantity.is.null,quantity.gt.0");
  }

  const [companiesResult, ownersResult, holdingsResult, profileResult] = await Promise.all([
    companyQuery.order("created_at"),
    supabase
      .from("portfolio_owners")
      .select("id, name, is_default")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("owner_holdings")
      .select("company_id, owner_id, quantity, avg_buy_price, buy_date"),
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
  if (ownersResult.error) {
    log.error("dashboard owners failed", { error: ownersResult.error.message });
    return NextResponse.json({ error: ownersResult.error.message }, { status: 500 });
  }
  if (holdingsResult.error) {
    log.error("dashboard holdings failed", { error: holdingsResult.error.message });
    return NextResponse.json({ error: holdingsResult.error.message }, { status: 500 });
  }

  const companies = companiesResult.data ?? [];
  const owners = ownersResult.data ?? [];
  const allHoldings = (holdingsResult.data ?? []).map((h) => ({
    company_id: h.company_id as string,
    owner_id: h.owner_id as string,
    quantity: (h.quantity as number) ?? 0,
    avg_buy_price: h.avg_buy_price as number | null,
    buy_date: h.buy_date as string | null,
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

  const allocationRanges = (profileResult.data?.allocation_ranges as Record<string, { min: number; max: number }> | null) ?? null;

  return NextResponse.json({ companies: normalized, owners, allHoldings, allocationRanges });
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
