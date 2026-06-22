"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "portfolio-actions" });

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

  if (error) {
    log.error("createPortfolio failed", { error: error.message, name });
    throw new Error(error.message);
  }
  revalidatePath("/");
  log.info("Portfolio created", { name });
}

export async function getPortfolios() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    log.error("getPortfolios failed", { error: error.message });
    throw new Error(error.message);
  }
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

  if (error) {
    log.error("ensureDefaultPortfolio failed", { error: error.message });
    throw new Error(error.message);
  }
  log.info("Default portfolio created");
  return data!.id;
}
