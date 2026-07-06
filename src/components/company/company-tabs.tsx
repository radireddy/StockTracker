"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsTabLoader } from "@/components/company/projections-tab-loader";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { HoldingsTab } from "@/components/company/holdings-tab";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { CompanyWithRelations } from "@/types/database";

type TabDef = { id: string; label: string; mobileLabel?: string };

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
      { id: "projections", label: "Projections & Valuations", mobileLabel: "Projections" },
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
  const tabsListRef = useRef<HTMLDivElement>(null);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
    setVisited((prev) => (prev.has(value) ? prev : new Set(prev).add(value)));
  }, []);

  // Scroll so the active tab's neighbors are always visible (mobile horizontal scroll)
  useEffect(() => {
    if (!tabsListRef.current) return;
    const container = tabsListRef.current;
    const allTabs = Array.from(container.querySelectorAll("[data-value]")) as HTMLElement[];
    const activeIndex = allTabs.findIndex((el) => el.dataset.value === activeTab);
    if (activeIndex === -1) return;

    const containerRect = container.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;

    const toScrollPos = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left - containerRect.left + scrollLeft, right: rect.right - containerRect.left + scrollLeft };
    };

    const prev = activeIndex > 0 ? allTabs[activeIndex - 1] : null;
    const next = activeIndex < allTabs.length - 1 ? allTabs[activeIndex + 1] : null;

    let targetScroll = scrollLeft;
    if (next) {
      const { right: nextRight } = toScrollPos(next);
      const minScroll = nextRight - containerWidth;
      if (targetScroll < minScroll) targetScroll = minScroll;
    }
    if (prev) {
      const { left: prevLeft } = toScrollPos(prev);
      if (targetScroll > prevLeft) targetScroll = prevLeft;
    }

    container.scrollTo({ left: Math.max(0, targetScroll), behavior: "smooth" });
  }, [activeTab]);

  const baseCaseBuyPrice = getDefaultModelBuyPrice(company.projection_models ?? []);

  const tabClassName =
    "px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-active:border-primary data-active:text-primary";

  return (
    <Tabs.Root
      value={activeTab}
      onValueChange={(value) => handleTabChange(value as string)}
    >
      <div ref={tabsListRef} className="overflow-x-auto no-scrollbar">
        <Tabs.List className="border-b border-border/50 mt-2 flex gap-0">
          {tabs.map((tab) => (
            <Tabs.Tab key={tab.id} value={tab.id} data-value={tab.id} className={tabClassName}>
              {tab.mobileLabel ? (
                <>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </div>

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
