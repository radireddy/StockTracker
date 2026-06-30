"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { ownerSchema } from "@/lib/validations";
import type { PortfolioOwner } from "@/types/database";

const log = createLogger({ service: "owner-actions" });

export async function getOwners(): Promise<PortfolioOwner[]> {
  const { supabase, user } = await getAuthUser();

  const { data, error } = await supabase
    .from("portfolio_owners")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    log.error("getOwners failed", { error: error.message });
    throw new Error(error.message);
  }

  return data as PortfolioOwner[];
}

export async function getDefaultOwnerId(): Promise<string> {
  const { supabase, user } = await getAuthUser();

  const { data } = await supabase
    .from("portfolio_owners")
    .select("id")
    .eq("is_default", true)
    .single();

  if (data) return data.id;

  // Fallback: find any owner
  const { data: anyOwner } = await supabase
    .from("portfolio_owners")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (anyOwner) return anyOwner.id;

  // Create default owner
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const name = profile?.display_name ?? profile?.email ?? "Default";

  const { data: newOwner, error } = await supabase
    .from("portfolio_owners")
    .insert({ user_id: user.id, name, is_default: true })
    .select("id")
    .single();

  if (error) {
    log.error("getDefaultOwnerId: create failed", { error: error.message });
    throw new Error(error.message);
  }

  return newOwner!.id;
}

export async function createOwner(input: {
  name: string;
  pan_number?: string;
  mobile?: string;
}): Promise<PortfolioOwner> {
  const { supabase, user } = await getAuthUser();

  const parsed = ownerSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  // Check if this is the first owner (should be default)
  const { count } = await supabase
    .from("portfolio_owners")
    .select("*", { count: "exact", head: true });

  const isFirst = (count ?? 0) === 0;

  const { data, error } = await supabase
    .from("portfolio_owners")
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      pan_number: input.pan_number?.trim() || null,
      mobile: input.mobile?.trim() || null,
      is_default: isFirst,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`Owner "${input.name.trim()}" already exists`);
    }
    log.error("createOwner failed", { error: error.message });
    throw new Error(error.message);
  }

  revalidatePath("/");
  log.info("Owner created", { name: input.name, id: data!.id });
  return data as PortfolioOwner;
}

export async function updateOwner(
  id: string,
  input: { name?: string; pan_number?: string; mobile?: string }
): Promise<PortfolioOwner> {
  const { supabase, user } = await getAuthUser();

  const updateData: Record<string, string | null> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.pan_number !== undefined)
    updateData.pan_number = input.pan_number.trim() || null;
  if (input.mobile !== undefined)
    updateData.mobile = input.mobile.trim() || null;

  const { data, error } = await supabase
    .from("portfolio_owners")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(`Owner "${input.name}" already exists`);
    }
    log.error("updateOwner failed", { error: error.message, id });
    throw new Error(error.message);
  }

  revalidatePath("/");
  return data as PortfolioOwner;
}

export async function deleteOwner(id: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Prevent deleting default owner
  const { data: owner } = await supabase
    .from("portfolio_owners")
    .select("is_default")
    .eq("id", id)
    .single();

  if (!owner) throw new Error("Owner not found");
  if (owner.is_default)
    throw new Error("Cannot delete the default owner. Set another as default first.");

  // Check for transactions
  const { count } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("owner_id", id);

  if ((count ?? 0) > 0) {
    throw new Error(
      `Cannot delete owner with ${count} transaction(s). Reassign or delete transactions first.`
    );
  }

  const { error } = await supabase
    .from("portfolio_owners")
    .delete()
    .eq("id", id);

  if (error) {
    log.error("deleteOwner failed", { error: error.message, id });
    throw new Error(error.message);
  }

  revalidatePath("/");
}
