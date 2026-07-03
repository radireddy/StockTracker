"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { accountSchema } from "@/lib/validations";
import type { Account } from "@/types/database";

const log = createLogger({ service: "account-actions" });

export async function getAccounts(): Promise<Account[]> {
  const { supabase } = await getAuthUser();

  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    log.error("getAccounts failed", { error: error.message });
    throw new Error(error.message);
  }
  return data as Account[];
}

export async function createAccount(input: {
  label: string;
  broker?: string;
  client_id?: string;
  pan_number?: string;
  mobile?: string;
}): Promise<Account> {
  const { supabase, user } = await getAuthUser();

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const { data, error } = await supabase
    .from("accounts")
    .insert({
      user_id: user.id,
      label: input.label.trim(),
      broker: input.broker?.trim() || "manual",
      client_id: input.client_id?.trim() || null,
      pan_number: input.pan_number?.trim() || null,
      mobile: input.mobile?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error(`An account named "${input.label.trim()}" already exists`);
    log.error("createAccount failed", { error: error.message });
    throw new Error(error.message);
  }

  revalidatePath("/");
  log.info("Account created", { label: input.label, id: data!.id });
  return data as Account;
}

export async function updateAccount(
  id: string,
  input: { label?: string; pan_number?: string; mobile?: string }
): Promise<Account> {
  const { supabase } = await getAuthUser();

  const updateData: Record<string, string | null> = {};
  if (input.label !== undefined) updateData.label = input.label.trim();
  if (input.pan_number !== undefined) updateData.pan_number = input.pan_number.trim() || null;
  if (input.mobile !== undefined) updateData.mobile = input.mobile.trim() || null;

  const { data, error } = await supabase
    .from("accounts")
    .update(updateData)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error(`An account named "${input.label}" already exists`);
    log.error("updateAccount failed", { error: error.message, id });
    throw new Error(error.message);
  }

  revalidatePath("/");
  return data as Account;
}

export async function deleteAccount(id: string): Promise<void> {
  const { supabase } = await getAuthUser();

  // Holdings for this account are removed via ON DELETE CASCADE.
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) {
    log.error("deleteAccount failed", { error: error.message, id });
    throw new Error(error.message);
  }
  revalidatePath("/");
}
