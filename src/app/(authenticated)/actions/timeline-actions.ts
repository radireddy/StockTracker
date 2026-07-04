"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sanitizeRichText } from "@/lib/sanitize";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "timeline-actions" });

/** All timeline entries for a company (lazy-fetched on first open of the tab). */
export async function getCompanyTimeline(companyId: string) {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("company_id", companyId);

  if (error) {
    log.error("getCompanyTimeline failed", { error: error.message, companyId });
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function createTimelineEntry(
  companyId: string,
  data: { quarter?: string; entry_date?: string; content: string; sort_order?: number }
) {
  const { supabase, user } = await getAuthUser();

  const { error } = await supabase.from("timeline_entries").insert({
    company_id: companyId,
    user_id: user.id,
    quarter: data.quarter,
    entry_date: data.entry_date,
    content: sanitizeRichText(data.content) ?? "",
    sort_order: data.sort_order,
  });

  if (error) {
    log.error("createTimelineEntry failed", { error: error.message, companyId });
    throw new Error(error.message);
  }
  revalidatePath(`/company/${companyId}`);
  log.info("Timeline entry created", { companyId });
}

export async function updateTimelineEntry(
  id: string,
  companyId: string,
  data: { quarter?: string; entry_date?: string; content?: string }
) {
  const { supabase, user } = await getAuthUser();

  const updateData: Record<string, unknown> = { ...data };
  if (data.content) updateData.content = sanitizeRichText(data.content) ?? "";

  const { error } = await supabase
    .from("timeline_entries")
    .update(updateData)
    .eq("id", id);

  if (error) {
    log.error("updateTimelineEntry failed", { error: error.message, entryId: id, companyId });
    throw new Error(error.message);
  }
  revalidatePath(`/company/${companyId}`);
  log.info("Timeline entry updated", { entryId: id, companyId });
}

export async function deleteTimelineEntry(id: string, companyId: string) {
  const { supabase, user } = await getAuthUser();

  const { error } = await supabase.from("timeline_entries").delete().eq("id", id);
  if (error) {
    log.error("deleteTimelineEntry failed", { error: error.message, entryId: id, companyId });
    throw new Error(error.message);
  }
  revalidatePath(`/company/${companyId}`);
  log.info("Timeline entry deleted", { entryId: id, companyId });
}
