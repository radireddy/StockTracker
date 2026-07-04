import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyPageClient } from "@/components/company/company-page-client";
import { getCompanyCore } from "@/app/(authenticated)/actions/company-actions";
import { getDefaultModelIRR } from "@/lib/utils/calculations";
import type { CompanyWithRelations } from "@/types/database";
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

  // Lightweight fetch — only what the header + Details tab need. Heavy relations
  // (thesis/highlights HTML, timeline, financial years, segments, perceptions)
  // are lazy-fetched by their tabs on first open. See getCompanyCore.
  let company: CompanyWithRelations;
  try {
    company = (await getCompanyCore(id)) as unknown as CompanyWithRelations;
  } catch {
    notFound();
  }
  if (!company) notFound();

  // Fetch portfolio type
  const supabase = await createClient();
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("type")
    .eq("id", company.portfolio_id)
    .single();

  const portfolioType = (portfolio?.type as "holdings" | "watchlist") ?? "holdings";

  // Base IRR is derived from the default model's valuation scenarios, which the
  // core fetch includes — so the header shows it immediately without the heavy
  // projections relation.
  const initialBaseIrr = getDefaultModelIRR(
    company.projection_models ?? [],
    company.indian_stocks?.market_cap,
    company.investment_horizon_years
  );

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyPageClient
        company={company}
        initialBaseIrr={initialBaseIrr}
        portfolioType={portfolioType}
      />
    </div>
  );
}
