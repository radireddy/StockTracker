"use client";

import { useState, useCallback } from "react";
import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";
import type { CompanyWithRelations, ProjectionModel, TimelineEntry } from "@/types/database";

export function CompanyPageClient({
  company,
  projectionModels,
  timelineEntries,
  initialBaseIrr,
  portfolioType = "holdings",
}: {
  company: CompanyWithRelations;
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
