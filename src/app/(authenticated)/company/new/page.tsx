import { CompanyForm } from "@/components/company/company-form";
import { getDefaultPortfolioId } from "../../actions/portfolio-actions";

export default async function NewCompanyPage() {
  const portfolioId = await getDefaultPortfolioId();

  return (
    <div>
      <CompanyForm portfolioId={portfolioId} />
    </div>
  );
}
