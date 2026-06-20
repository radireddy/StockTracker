import { createClient } from "@/lib/supabase/server";
import { CompaniesTable } from "@/components/dashboard/companies-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ensureDefaultPortfolio } from "./actions/portfolio-actions";

export default async function DashboardPage() {
  const supabase = await createClient();

  await ensureDefaultPortfolio();

  const { data: companies } = await supabase
    .from("companies")
    .select("*, indian_stocks(*), projection_models(*, valuation_scenarios(*))")
    .order("created_at");

  return (
    <div className="max-w-6xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          All Companies
          <span className="ml-2 text-base font-normal text-muted-foreground">
            ({companies?.length ?? 0})
          </span>
        </h1>
        <Link href="/company/new">
          <Button size="sm" className="h-8 text-sm">+ Add Company</Button>
        </Link>
      </div>
      <CompaniesTable companies={companies ?? []} />
    </div>
  );
}
