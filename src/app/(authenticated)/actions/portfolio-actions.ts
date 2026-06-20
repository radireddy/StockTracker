"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPortfolio(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const name = formData.get("name") as string;
  const description = formData.get("description") as string | null;

  const { error } = await supabase.from("portfolios").insert({
    user_id: user.id,
    name,
    description,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function getPortfolios() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function ensureDefaultPortfolio() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: existing } = await supabase
    .from("portfolios")
    .select("id")
    .eq("is_default", true)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("portfolios")
    .insert({
      user_id: user.id,
      name: "My Portfolio",
      is_default: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data!.id;
}
