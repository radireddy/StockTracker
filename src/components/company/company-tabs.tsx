"use client";

import { useState } from "react";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsValuationTab } from "@/components/company/projections-valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { Company, ProjectionModel, TimelineEntry } from "@/types/database";

const TABS = [
  { id: "details", label: "Details" },
  { id: "thesis", label: "Thesis" },
  { id: "projections", label: "Projections & Valuations" },
  { id: "timeline", label: "Timeline" },
  { id: "highlights", label: "Highlights" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function CompanyTabs({
  company,
  projectionModels,
  timelineEntries,
  onBaseIrrChange,
}: {
  company: Company & { segment_valuations: any[]; market_perceptions: any[] };
  projectionModels: ProjectionModel[];
  timelineEntries: TimelineEntry[];
  onBaseIrrChange?: (irr: number | null) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("details");

  return (
    <div>
      <nav className="border-b border-border/50 mt-2">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => (
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
        {activeTab === "thesis" && <ThesisTab company={company} />}
        {activeTab === "projections" && (
          <ProjectionsValuationTab
            company={company}
            projectionModels={projectionModels}
            onBaseIrrChange={onBaseIrrChange}
          />
        )}
        {activeTab === "timeline" && (
          <TimelineTab companyId={company.id} entries={timelineEntries} />
        )}
        {activeTab === "highlights" && <HighlightsSection company={company} />}
        {activeTab === "details" && (
          <EditCompanyTab
            company={company}
            baseCaseBuyPrice={getDefaultModelBuyPrice(projectionModels)}
          />
        )}
      </div>
    </div>
  );
}
