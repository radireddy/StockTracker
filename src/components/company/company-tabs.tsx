"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsValuationTab } from "@/components/company/projections-valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { HoldingsTab } from "@/components/company/holdings-tab";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { CompanyWithRelations, ProjectionModel, TimelineEntry } from "@/types/database";

type TabDef = { id: string; label: string };

export function CompanyTabs({
  company,
  projectionModels,
  timelineEntries,
  onBaseIrrChange,
  portfolioType = "holdings",
}: {
  company: CompanyWithRelations;
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

  const tabClassName =
    "px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-active:border-primary data-active:text-primary";

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as string)}
    >
      <Tabs.List className="border-b border-border/50 mt-2 flex gap-0 overflow-x-auto">
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} className={tabClassName}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <div className="py-6">
        <Tabs.Panel value="details" keepMounted>
          <EditCompanyTab
            company={company}
            baseCaseBuyPrice={getDefaultModelBuyPrice(projectionModels)}
          />
        </Tabs.Panel>
        {portfolioType === "holdings" && (
          <Tabs.Panel value="holdings" keepMounted>
            <HoldingsTab
              companyId={company.id}
              portfolioId={company.portfolio_id}
              isin={company.isin}
            />
          </Tabs.Panel>
        )}
        <Tabs.Panel value="thesis" keepMounted>
          <ThesisTab company={company} />
        </Tabs.Panel>
        <Tabs.Panel value="projections" keepMounted>
          <ProjectionsValuationTab
            company={company}
            projectionModels={projectionModels}
            onBaseIrrChange={onBaseIrrChange}
          />
        </Tabs.Panel>
        <Tabs.Panel value="timeline" keepMounted>
          <TimelineTab companyId={company.id} entries={timelineEntries} />
        </Tabs.Panel>
        <Tabs.Panel value="highlights" keepMounted>
          <HighlightsSection company={company} />
        </Tabs.Panel>
      </div>
    </Tabs.Root>
  );
}
