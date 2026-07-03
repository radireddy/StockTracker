"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AllocationRanges } from "@/types/database";

export async function getAllocationRanges(): Promise<AllocationRanges | null> {
  const { supabase, user } = await getAuthUser();

  const { data } = await supabase
    .from("profiles")
    .select("allocation_ranges")
    .eq("id", user.id)
    .single();

  return (data?.allocation_ranges as AllocationRanges | null) ?? null;
}

export async function saveAllocationRanges(ranges: AllocationRanges): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const { error } = await supabase
    .from("profiles")
    .update({ allocation_ranges: ranges })
    .eq("id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
}
