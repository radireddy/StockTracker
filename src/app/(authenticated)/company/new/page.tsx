import { CompanyForm } from "@/components/company/company-form";
import { getDefaultPortfolioId, getPortfolio } from "../../actions/portfolio-actions";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const params = await searchParams;
  const portfolioId = params.portfolio || (await getDefaultPortfolioId());
  const portfolio = await getPortfolio(portfolioId);
  const portfolioType = portfolio?.type ?? "holdings";

  return (
    <div>
      <CompanyForm portfolioId={portfolioId} portfolioType={portfolioType} />
    </div>
  );
}
