import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the account id for a manual position: return an existing
 * `account_id`, or create a `broker: 'manual'` account from
 * `new_account_label` and return its id. Throws when neither is provided.
 */
export async function resolveAccountId(
  supabase: SupabaseClient,
  userId: string,
  input: { account_id?: string | null; new_account_label?: string | null }
): Promise<string> {
  if (input.new_account_label) {
    const label = input.new_account_label.trim();
    const { data, error } = await supabase
      .from("accounts")
      .insert({ user_id: userId, label, broker: "manual" })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        (error as { code?: string }).code === "23505"
          ? `An account named "${label}" already exists`
          : (error as { message?: string }).message ?? "Failed to create account"
      );
    }
    return (data as { id: string }).id;
  }
  if (input.account_id) return input.account_id;
  throw new Error("Account is required");
}
