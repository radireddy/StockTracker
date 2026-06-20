import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CompanyHeader } from "@/components/company/company-header";
import { SectionNav } from "@/components/company/section-nav";
import { ThesisTab } from "@/components/company/thesis-tab";
import { FinancialModelTab } from "@/components/company/financial-model-tab";
import { ValuationTab } from "@/components/company/valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { HighlightsSection } from "@/components/company/highlights-section";

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

  const financialYears = (company.financial_years ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );
  const timelineEntries = (company.timeline_entries ?? []).sort(
    (a: { sort_order: number }, b: { sort_order: number }) => (b.sort_order ?? 0) - (a.sort_order ?? 0)
  );

  return (
    <div className="max-w-6xl mx-auto">
      <CompanyHeader company={company} scenarios={company.valuation_scenarios ?? []} />
      <SectionNav />

      <div className="space-y-12 py-6">
        <section id="thesis" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Investment Thesis
          </h2>
          <ThesisTab company={company} />
        </section>

        <section id="financials" className="scroll-mt-28">
          <FinancialModelTab
            companyId={company.id}
            financialYears={financialYears}
          />
        </section>

        <section id="valuation" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Valuation Scenarios
          </h2>
          <ValuationTab
            companyId={company.id}
            scenarios={company.valuation_scenarios ?? []}
            currentPrice={company.current_price}
            marketCap={company.market_cap}
            expectedReturns={company.expected_returns}
            horizonYears={company.investment_horizon_years}
            financialYears={financialYears}
          />
        </section>

        <section id="timeline" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Timeline
          </h2>
          <TimelineTab
            companyId={company.id}
            entries={timelineEntries}
          />
        </section>

        <section id="highlights" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Highlights
          </h2>
          <HighlightsSection company={company} />
        </section>

        <section id="details" className="scroll-mt-28">
          <h2 className="text-base font-medium border-b border-border/50 pb-2 mb-4">
            Company Details
          </h2>
          <EditCompanyTab company={company} />
        </section>
      </div>
    </div>
  );
}
