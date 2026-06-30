"use client";

import { CompanyHeader } from "@/components/company/company-header";
import { CompanyTabs } from "@/components/company/company-tabs";
import { useCompanyDetail } from "@/hooks/use-company-detail";
import { Skeleton } from "@/components/ui/skeleton";

export function CompanyPageClient({ companyId }: { companyId: string }) {
  const {
    company,
    projectionModels,
    baseIrr,
    isFullDataLoaded,
    isLoading,
    portfolioType,
    error,
  } = useCompanyDetail(companyId);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">Company not found</p>
        <p className="text-sm mt-1">
          The company you&apos;re looking for doesn&apos;t exist or you don&apos;t have access.
        </p>
      </div>
    );
  }

  if (isLoading || !company) {
    return (
      <div className="space-y-4 pt-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <CompanyHeader company={company} baseIrr={baseIrr} />
      <CompanyTabs
        company={company}
        projectionModels={projectionModels}
        isFullDataLoaded={isFullDataLoaded}
        portfolioType={portfolioType}
      />
    </>
  );
}
