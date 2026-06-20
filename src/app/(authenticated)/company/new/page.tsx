import { CompanyForm } from "@/components/company/company-form";
import { ensureDefaultPortfolio } from "../../actions/portfolio-actions";

export default async function NewCompanyPage() {
  const portfolioId = await ensureDefaultPortfolio();

  return (
    <div>
      <CompanyForm portfolioId={portfolioId} />
    </div>
  );
}
