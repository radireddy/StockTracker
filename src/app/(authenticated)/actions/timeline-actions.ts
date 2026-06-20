"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import DOMPurify from "isomorphic-dompurify";

export async function createTimelineEntry(
  companyId: string,
  data: { quarter?: string; entry_date?: string; content: string; sort_order?: number }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("timeline_entries").insert({
    company_id: companyId,
    user_id: user.id,
    quarter: data.quarter,
    entry_date: data.entry_date,
    content: DOMPurify.sanitize(data.content),
    sort_order: data.sort_order,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function updateTimelineEntry(
  id: string,
  companyId: string,
  data: { quarter?: string; entry_date?: string; content?: string }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const updateData: Record<string, unknown> = { ...data };
  if (data.content) updateData.content = DOMPurify.sanitize(data.content);

  const { error } = await supabase
    .from("timeline_entries")
    .update(updateData)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}

export async function deleteTimelineEntry(id: string, companyId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("timeline_entries").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/company/${companyId}`);
}
