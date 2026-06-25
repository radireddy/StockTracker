"use client";

import { CompanyForm } from "@/components/company/company-form";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";

export default function NewCompanyPage() {
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const portfolioType = selectedPortfolio?.type ?? "holdings";

  return (
    <div>
      <CompanyForm portfolioId={selectedId} portfolioType={portfolioType} />
    </div>
  );
}
