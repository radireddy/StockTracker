"use client";

import { useState, useMemo } from "react";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsValuationTab } from "@/components/company/projections-valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { HoldingsTab } from "@/components/company/holdings-tab";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { Company, ProjectionModel, TimelineEntry } from "@/types/database";

type TabDef = { id: string; label: string };

export function CompanyTabs({
  company,
  projectionModels,
  timelineEntries,
  onBaseIrrChange,
  portfolioType = "holdings",
}: {
  company: Company & { segment_valuations: any[]; market_perceptions: any[] };
  projectionModels: ProjectionModel[];
  timelineEntries: TimelineEntry[];
  onBaseIrrChange?: (irr: number | null) => void;
  portfolioType?: "holdings" | "watchlist";
}) {
  const tabs = useMemo(() => {
    const base: TabDef[] = [
      { id: "details", label: "Details" },
      { id: "thesis", label: "Thesis" },
      { id: "projections", label: "Projections & Valuations" },
      { id: "timeline", label: "Timeline" },
      { id: "highlights", label: "Highlights" },
    ];
    if (portfolioType === "holdings") {
      base.splice(1, 0, { id: "holdings", label: "Holdings" });
    }
    return base;
  }, [portfolioType]);

  const [activeTab, setActiveTab] = useState("details");

  return (
    <div>
      <nav className="border-b border-border/50 mt-2">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="py-6">
        <div className={activeTab === "details" ? undefined : "hidden"}>
          <EditCompanyTab
            company={company}
            baseCaseBuyPrice={getDefaultModelBuyPrice(projectionModels)}
          />
        </div>
        {portfolioType === "holdings" && (
          <div className={activeTab === "holdings" ? undefined : "hidden"}>
            <HoldingsTab
              companyId={company.id}
              portfolioId={company.portfolio_id}
              isin={company.isin}
            />
          </div>
        )}
        <div className={activeTab === "thesis" ? undefined : "hidden"}>
          <ThesisTab company={company} />
        </div>
        <div className={activeTab === "projections" ? undefined : "hidden"}>
          <ProjectionsValuationTab
            company={company}
            projectionModels={projectionModels}
            onBaseIrrChange={onBaseIrrChange}
          />
        </div>
        <div className={activeTab === "timeline" ? undefined : "hidden"}>
          <TimelineTab companyId={company.id} entries={timelineEntries} />
        </div>
        <div className={activeTab === "highlights" ? undefined : "hidden"}>
          <HighlightsSection company={company} />
        </div>
      </div>
    </div>
  );
}
