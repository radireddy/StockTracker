"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertFinancialYear(
  companyId: string,
  yearData: {
    year: string;
    is_estimate: boolean;
    revenue?: number | null;
    revenue_growth_pct?: number | null;
    ebitda?: number | null;
    ebitda_margin_pct?: number | null;
    ebitda_growth_pct?: number | null;
    depreciation?: number | null;
    finance_cost?: number | null;
    other_income?: number | null;
    exceptional_items?: number | null;
    pbt?: number | null;
    tax_pct?: number | null;
    pat?: number | null;
    pat_growth_pct?: number | null;
    pat_margin_pct?: number | null;
    minority_interest?: number | null;
    pat_for_shareholders?: number | null;
    pe?: number | null;
    peg?: number | null;
    sort_order: number;
  }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("financial_years").upsert(
    {
      company_id: companyId,
      user_id: user.id,
      ...yearData,
    },
    { onConflict: "company_id,year" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function bulkUpsertFinancialYears(
  companyId: string,
  years: Array<{
    year: string;
    is_estimate: boolean;
    sort_order: number;
    [key: string]: unknown;
  }>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const rows = years.map((y) => ({
    company_id: companyId,
    user_id: user.id,
    ...y,
  }));

  const { error } = await supabase
    .from("financial_years")
    .upsert(rows, { onConflict: "company_id,year" });

  if (error) throw new Error(error.message);

  // Auto-update investment_horizon_years: count of estimate years (current + future FY)
  const horizonYears = rows.filter((r) => r.is_estimate).length;
  await supabase
    .from("companies")
    .update({ investment_horizon_years: Math.max(0, horizonYears) })
    .eq("id", companyId);

  revalidatePath(`/company/${companyId}`);
  revalidatePath("/");
}
