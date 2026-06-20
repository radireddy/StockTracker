import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";

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
  const defaultModel = projectionModels.find((pm: any) => pm.is_default);
  const defaultScenarios = defaultModel?.valuation_scenarios ?? [];

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyHeader company={company} scenarios={defaultScenarios} />
      <CompanyTabs
        company={company}
        projectionModels={projectionModels}
        timelineEntries={timelineEntries}
      />
    </div>
  );
}
