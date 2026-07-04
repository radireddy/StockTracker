"use client";

import { useMemo, useState, useCallback } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsTabLoader } from "@/components/company/projections-tab-loader";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { HoldingsTab } from "@/components/company/holdings-tab";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { CompanyWithRelations } from "@/types/database";

type TabDef = { id: string; label: string };

export function CompanyTabs({
  company,
  onBaseIrrChange,
  portfolioType = "holdings",
}: {
  company: CompanyWithRelations;
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
  // Track which tabs have been opened so heavy tabs mount (and fetch their data)
  // only on first activation. Once opened, panels stay mounted (keepMounted) so
  // in-progress edits and fetched data are preserved when switching tabs.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(["details"]));

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setVisited((prev) => (prev.has(value) ? prev : new Set(prev).add(value)));
  }, []);

  const baseCaseBuyPrice = getDefaultModelBuyPrice(company.projection_models ?? []);

  const tabClassName =
    "px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-active:border-primary data-active:text-primary";

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => handleTabChange(value as string)}
    >
      <Tabs.List className="border-b border-border/50 mt-2 flex gap-0 overflow-x-auto">
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.id} value={tab.id} className={tabClassName}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <div className="py-6">
        {/* Details renders immediately from the light core fetch. */}
        <Tabs.Panel value="details" keepMounted>
          <EditCompanyTab company={company} baseCaseBuyPrice={baseCaseBuyPrice} />
        </Tabs.Panel>
        {portfolioType === "holdings" && (
          <Tabs.Panel value="holdings" keepMounted>
            {visited.has("holdings") && (
              <HoldingsTab
                companyId={company.id}
                portfolioId={company.portfolio_id}
                isin={company.isin}
              />
            )}
          </Tabs.Panel>
        )}
        <Tabs.Panel value="thesis" keepMounted>
          {visited.has("thesis") && <ThesisTab companyId={company.id} />}
        </Tabs.Panel>
        <Tabs.Panel value="projections" keepMounted>
          {visited.has("projections") && (
            <ProjectionsTabLoader company={company} onBaseIrrChange={onBaseIrrChange} />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="timeline" keepMounted>
          {visited.has("timeline") && <TimelineTab companyId={company.id} />}
        </Tabs.Panel>
        <Tabs.Panel value="highlights" keepMounted>
          {visited.has("highlights") && <HighlightsSection companyId={company.id} />}
        </Tabs.Panel>
      </div>
    </Tabs.Root>
  );
}
