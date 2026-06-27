"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "valuation-actions" });

export async function upsertValuation(
  companyId: string,
  scenario: {
    scenario_type: "bull" | "base" | "bare";
    target_pe?: number | null;
    target_market_cap?: number | null;
    irr?: number | null;
    buying_market_cap?: number | null;
    buy_price?: number | null;
  }
) {
  const { supabase, user } = await getAuthUser();

  const { error } = await supabase.from("valuation_scenarios").upsert(
    {
      company_id: companyId,
      user_id: user.id,
      ...scenario,
    },
    { onConflict: "company_id,scenario_type" }
  );

  if (error) {
    log.error("upsertValuation failed", { error: error.message, companyId, scenarioType: scenario.scenario_type });
    throw new Error(error.message);
  }
  revalidatePath(`/company/${companyId}`);
  log.info("Valuation upserted", { companyId, scenarioType: scenario.scenario_type });
}
