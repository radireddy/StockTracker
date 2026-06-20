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
    .select("*, valuation_scenarios(*)")
    .order("name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">All Companies</h1>
        <Link href="/company/new">
          <Button>Add Company</Button>
        </Link>
      </div>
      <CompaniesTable companies={companies ?? []} />
    </div>
  );
}
