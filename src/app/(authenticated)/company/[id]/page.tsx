import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyPageClient } from "@/components/company/company-page-client";
import { getDefaultModelIRR } from "@/lib/utils/calculations";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company, error } = await supabase
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

  if (error || !company) notFound();

  // Fetch portfolio type
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("type")
    .eq("id", company.portfolio_id)
    .single();

  const portfolioType = (portfolio?.type as "holdings" | "watchlist") ?? "holdings";

  const projectionModels = (company.projection_models ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pm: any) => ({
      ...pm,
      financial_years: (pm.financial_years ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

  const timelineEntries = company.timeline_entries ?? [];
  const initialBaseIrr = getDefaultModelIRR(
    projectionModels,
    company.indian_stocks?.market_cap,
    company.investment_horizon_years
  );

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyPageClient
        company={company}
        projectionModels={projectionModels}
        timelineEntries={timelineEntries}
        initialBaseIrr={initialBaseIrr}
        portfolioType={portfolioType}
      />
    </div>
  );
}
