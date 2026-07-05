"use server";

import { getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { createLogger } from "@/lib/logger";
import { accountSchema } from "@/lib/validations";
import { action, AppError, describeDbError, type ActionResult } from "@/lib/action-result";
import { buildAccountUpdate } from "@/lib/accounts";
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
}): Promise<ActionResult<Account>> {
  return action(async () => {
    const { supabase, user } = await getAuthUser();

    const parsed = accountSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, "Correct the highlighted fields and try again.");
    }

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
      if (error.code === "23505") {
        throw new AppError(
          `An account named "${input.label.trim()}" already exists.`,
          "Choose a different account name."
        );
      }
      log.error("createAccount failed", { error: error.message });
      throw describeDbError(error, "Couldn't create the account.");
    }

    revalidatePath("/");
    log.info("Account created", { label: input.label, id: data!.id });
    return data as Account;
  });
}

export async function updateAccount(
  id: string,
  input: { label?: string; broker?: string; client_id?: string; pan_number?: string; mobile?: string }
): Promise<ActionResult<Account>> {
  return action(async () => {
    const { supabase } = await getAuthUser();

    const parsed = accountSchema.partial().safeParse(input);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0].message, "Correct the highlighted fields and try again.");
    }

    const updateData = buildAccountUpdate(input);
    if (Object.keys(updateData).length === 0) {
      throw new AppError("Nothing to update.", "Change a field and try again.");
    }

    const { data, error } = await supabase
      .from("accounts")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        const dupClientId = updateData.client_id != null;
        throw new AppError(
          dupClientId
            ? "Another account already uses that Client ID for this broker."
            : `An account named "${input.label}" already exists.`,
          dupClientId ? "Client IDs must be unique per broker." : "Choose a different account name."
        );
      }
      log.error("updateAccount failed", { error: error.message, id });
      throw describeDbError(error, "Couldn't update the account.");
    }

    revalidatePath("/");
    return data as Account;
  });
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  return action(async () => {
    const { supabase } = await getAuthUser();

    // Holdings for this account are removed via ON DELETE CASCADE.
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) {
      log.error("deleteAccount failed", { error: error.message, id });
      throw describeDbError(error, "Couldn't delete the account.");
    }
    revalidatePath("/");
  });
}
