import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyPageClient } from "@/components/company/company-page-client";
import { getDefaultModelIRR } from "@/lib/utils/calculations";
import type { ProjectionModel, FinancialYear } from "@/types/database";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("indian_stocks(name)")
    .eq("id", id)
    .single();
  const rel = data?.indian_stocks as
    | { name: string | null }
    | { name: string | null }[]
    | null
    | undefined;
  const name = Array.isArray(rel) ? rel[0]?.name : rel?.name;
  return { title: name ?? "Company" };
}

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

  const projectionModels = ((company.projection_models ?? []) as ProjectionModel[])
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pm) => ({
      ...pm,
      financial_years: ((pm.financial_years ?? []) as FinancialYear[]).sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
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
