"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("valuation_scenarios").upsert(
    {
      company_id: companyId,
      user_id: user.id,
      ...scenario,
    },
    { onConflict: "company_id,scenario_type" }
  );

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}
