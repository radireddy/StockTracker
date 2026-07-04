"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ProjectionsValuationTab } from "@/components/company/projections-valuation-tab";
import { getCompanyProjections } from "@/app/(authenticated)/actions/projection-actions";
import type { Company, ProjectionModel } from "@/types/database";

/**
 * Lazy loader for the Projections & Valuations tab. Fetches the heavy
 * financial_years + valuation_scenarios relation (deliberately excluded from
 * the initial company-page render) only once the tab is first opened, then
 * hands the fully-loaded models to ProjectionsValuationTab, which manages its
 * own state from there.
 */
export function ProjectionsTabLoader({
  company,
  onBaseIrrChange,
}: {
  company: Company;
  onBaseIrrChange?: (irr: number | null) => void;
}) {
  const [models, setModels] = useState<ProjectionModel[] | null>(null);

  useEffect(() => {
    let active = true;
    getCompanyProjections(company.id).then((data) => {
      if (active) setModels(data);
    });
    return () => {
      active = false;
    };
  }, [company.id]);

  if (models === null) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <ProjectionsValuationTab
      company={company}
      projectionModels={models}
      onBaseIrrChange={onBaseIrrChange}
    />
  );
}
