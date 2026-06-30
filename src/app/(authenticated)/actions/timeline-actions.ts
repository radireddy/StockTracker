"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import DOMPurify from "isomorphic-dompurify";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "timeline-actions" });

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
    content: DOMPurify.sanitize(data.content),
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
  if (data.content) updateData.content = DOMPurify.sanitize(data.content);

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

export async function getTimelineEntries(companyId: string) {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    log.error("getTimelineEntries failed", { error: error.message, companyId });
    throw new Error(error.message);
  }
  return data ?? [];
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
