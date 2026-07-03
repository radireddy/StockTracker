"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { action, describeDbError, type ActionResult } from "@/lib/action-result";

const log = createLogger({ service: "financial-actions" });

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
): Promise<ActionResult> {
  return action(async () => {
    const { supabase, user } = await getAuthUser();

    const { error } = await supabase.from("financial_years").upsert(
      {
        company_id: companyId,
        user_id: user.id,
        ...yearData,
      },
      { onConflict: "company_id,year" }
    );

    if (error) {
      log.error("upsertFinancialYear failed", { error: error.message, companyId, year: yearData.year });
      throw describeDbError(error, "Couldn't save the financial year.");
    }
    revalidatePath(`/company/${companyId}`);
    log.info("Financial year upserted", { companyId, year: yearData.year });
  });
}

export async function bulkUpsertFinancialYears(
  companyId: string,
  years: Array<{
    year: string;
    is_estimate: boolean;
    sort_order: number;
    [key: string]: unknown;
  }>
): Promise<ActionResult> {
  return action(async () => {
    const { supabase, user } = await getAuthUser();

    const rows = years.map((y) => ({
      company_id: companyId,
      user_id: user.id,
      ...y,
    }));

    const { error } = await supabase
      .from("financial_years")
      .upsert(rows, { onConflict: "company_id,year" });

    if (error) {
      log.error("bulkUpsertFinancialYears failed", { error: error.message, companyId, yearCount: years.length });
      throw describeDbError(error, "Couldn't save the financial years.");
    }

    // Auto-update investment_horizon_years: count of estimate years (current + future FY)
    const horizonYears = rows.filter((r) => r.is_estimate).length;
    const { error: horizonErr } = await supabase
      .from("companies")
      .update({ investment_horizon_years: Math.max(0, horizonYears) })
      .eq("id", companyId);

    if (horizonErr) {
      log.error("bulkUpsertFinancialYears horizon update failed", { error: horizonErr.message, companyId });
      throw describeDbError(horizonErr, "Financial years were saved, but the investment horizon couldn't be updated.");
    }

    revalidatePath(`/company/${companyId}`);
    revalidatePath("/");
    log.info("Financial years bulk upserted", { companyId, yearCount: rows.length, horizonYears });
  });
}
