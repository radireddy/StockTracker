"use client";

import { useState, useCallback } from "react";
import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";
import type { CompanyWithRelations } from "@/types/database";

export function CompanyPageClient({
  company,
  initialBaseIrr,
  portfolioType = "holdings",
}: {
  company: CompanyWithRelations;
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
        onBaseIrrChange={handleBaseIrrChange}
        portfolioType={portfolioType}
      />
    </>
  );
}
