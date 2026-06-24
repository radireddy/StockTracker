"use client";

import { useState, useCallback } from "react";
import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";
import type { Company, ProjectionModel, TimelineEntry } from "@/types/database";

export function CompanyPageClient({
  company,
  projectionModels,
  timelineEntries,
  initialBaseIrr,
  portfolioType = "holdings",
}: {
  company: Company & { segment_valuations: any[]; market_perceptions: any[] };
  projectionModels: ProjectionModel[];
  timelineEntries: TimelineEntry[];
  initialBaseIrr: number | null;
  portfolioType?: "holdings" | "watchlist";
}) {
  const [baseIrr, setBaseIrr] = useState<number | null>(initialBaseIrr);

  const handleBaseIrrChange = useCallback((irr: number | null) => {
    setBaseIrr(irr);
  }, []);

  return (
    <>
      <CompanyHeader company={company} baseIrr={baseIrr} />
      <CompanyTabs
        company={company}
        projectionModels={projectionModels}
        timelineEntries={timelineEntries}
        onBaseIrrChange={handleBaseIrrChange}
        portfolioType={portfolioType}
      />
    </>
  );
}
