import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanyHeader } from "@/components/company/company-header";
import { ThesisTab } from "@/components/company/thesis-tab";
import { FinancialModelTab } from "@/components/company/financial-model-tab";
import { ValuationTab } from "@/components/company/valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";

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
      valuation_scenarios(*),
      financial_years(*),
      timeline_entries(*),
      segment_valuations(*),
      market_perceptions(*)
    `)
    .eq("id", id)
    .single();

  if (error || !company) notFound();

  // Sort financial_years by sort_order
  const financialYears = (company.financial_years ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  // Sort timeline entries by sort_order desc (newest first)
  const timelineEntries = (company.timeline_entries ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => (b.sort_order ?? 0) - (a.sort_order ?? 0)
  );

  return (
    <div className="space-y-6">
      <CompanyHeader company={company} />
      <Tabs defaultValue="thesis">
        <TabsList>
          <TabsTrigger value="thesis">Thesis</TabsTrigger>
          <TabsTrigger value="model">Financial Model</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>
        <TabsContent value="thesis" className="mt-4">
          <ThesisTab company={company} />
        </TabsContent>
        <TabsContent value="model" className="mt-4">
          <FinancialModelTab
            companyId={company.id}
            financialYears={financialYears}
          />
        </TabsContent>
        <TabsContent value="valuation" className="mt-4">
          <ValuationTab
            companyId={company.id}
            scenarios={company.valuation_scenarios ?? []}
            currentPrice={company.current_price}
          />
        </TabsContent>
        <TabsContent value="timeline" className="mt-4">
          <TimelineTab
            companyId={company.id}
            entries={timelineEntries}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
