"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import DOMPurify from "isomorphic-dompurify";

function sanitizeHtml(html: string | null): string | null {
  if (!html) return null;
  return DOMPurify.sanitize(html);
}

export async function getCompanies(portfolioId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  let query = supabase
    .from("companies")
    .select("*, valuation_scenarios(*)")
    .order("name");

  if (portfolioId) {
    query = query.eq("portfolio_id", portfolioId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

export async function getCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("companies")
    .select(`
      *,
      valuation_scenarios(*),
      financial_years(*),
      timeline_entries(*),
      segment_valuations(*),
      market_perceptions(*)
    `)
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createCompany(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("companies").insert({
    user_id: user.id,
    portfolio_id: formData.get("portfolio_id") as string,
    name: formData.get("name") as string,
    symbol: formData.get("symbol") as string | null,
    sector: formData.get("sector") as string | null,
    market_cap: formData.get("market_cap") ? Number(formData.get("market_cap")) : null,
    current_price: formData.get("current_price") ? Number(formData.get("current_price")) : null,
    buy_price: formData.get("buy_price") ? Number(formData.get("buy_price")) : null,
    star_rating: formData.get("star_rating") ? Number(formData.get("star_rating")) : null,
    strategy: formData.get("strategy") as "core" | "satellite" | null,
    investment_horizon_years: formData.get("investment_horizon_years") ? Number(formData.get("investment_horizon_years")) : null,
    thesis: sanitizeHtml(formData.get("thesis") as string | null),
    highlights: sanitizeHtml(formData.get("highlights") as string | null),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function updateCompany(id: string, data: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  if (data.thesis) data.thesis = sanitizeHtml(data.thesis as string);
  if (data.highlights) data.highlights = sanitizeHtml(data.highlights as string);

  const { error } = await supabase
    .from("companies")
    .update(data)
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/company/${id}`);
  revalidatePath("/");
}

export async function deleteCompany(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("companies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
