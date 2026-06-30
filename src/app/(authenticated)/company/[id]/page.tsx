import { CompanyPageClient } from "@/components/company/company-page-client";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="max-w-6xl mx-auto">
      <CompanyPageClient companyId={id} />
    </div>
  );
}
