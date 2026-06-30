"use client";

import { useState, useMemo } from "react";
import { ThesisTab } from "@/components/company/thesis-tab";
import { ProjectionsValuationTab } from "@/components/company/projections-valuation-tab";
import { TimelineTab } from "@/components/company/timeline-tab";
import { HighlightsSection } from "@/components/company/highlights-section";
import { EditCompanyTab } from "@/components/company/edit-company-tab";
import { TransactionsTab } from "@/components/company/transactions-tab";
import { Skeleton } from "@/components/ui/skeleton";
import { getDefaultModelBuyPrice } from "@/lib/utils/calculations";
import type { Company, ProjectionModel } from "@/types/database";

type TabDef = { id: string; label: string };

function TabLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function CompanyTabs({
  company,
  projectionModels,
  onBaseIrrChange,
  isFullDataLoaded = true,
  portfolioType = "holdings",
}: {
  company: Company;
  projectionModels: ProjectionModel[];
  onBaseIrrChange?: (irr: number | null) => void;
  isFullDataLoaded?: boolean;
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
      base.splice(1, 0, { id: "transactions", label: "Transactions" });
    }
    return base;
  }, [portfolioType]);

  const [activeTab, setActiveTab] = useState("details");

  const needsFullData = activeTab === "thesis" || activeTab === "projections" || activeTab === "highlights";

  const renderTab = () => {
    if (needsFullData && !isFullDataLoaded) {
      return <TabLoadingSkeleton />;
    }

    switch (activeTab) {
      case "details":
        return (
          <EditCompanyTab
            company={company}
            baseCaseBuyPrice={getDefaultModelBuyPrice(projectionModels)}
          />
        );
      case "transactions":
        return portfolioType === "holdings" ? (
          <TransactionsTab companyId={company.id} currentPrice={company.indian_stocks?.price ?? null} />
        ) : null;
      case "thesis":
        return <ThesisTab company={company} />;
      case "projections":
        return (
          <ProjectionsValuationTab
            company={company}
            projectionModels={projectionModels}
            onBaseIrrChange={onBaseIrrChange}
          />
        );
      case "timeline":
        return <TimelineTab companyId={company.id} />;
      case "highlights":
        return <HighlightsSection company={company} />;
      default:
        return null;
    }
  };

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
        {renderTab()}
      </div>
    </div>
  );
}
