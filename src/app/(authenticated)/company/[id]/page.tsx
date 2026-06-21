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

  const projectionModels = (company.projection_models ?? [])
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((pm: any) => ({
      ...pm,
      financial_years: (pm.financial_years ?? []).sort(
        (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
      ),
    }));

  const timelineEntries = company.timeline_entries ?? [];
  const initialBaseIrr = getDefaultModelIRR(projectionModels);

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyPageClient
        company={company}
        projectionModels={projectionModels}
        timelineEntries={timelineEntries}
        initialBaseIrr={initialBaseIrr}
      />
    </div>
  );
}
