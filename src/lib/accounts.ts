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

/** Build a normalized `accounts` update object from form input (trim; empty → null). */
export function buildAccountUpdate(input: {
  label?: string;
  broker?: string;
  client_id?: string;
  pan_number?: string;
  mobile?: string;
}): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (input.label !== undefined) out.label = input.label.trim();
  if (input.broker !== undefined && input.broker.trim()) out.broker = input.broker.trim();
  if (input.client_id !== undefined) out.client_id = input.client_id.trim() || null;
  if (input.pan_number !== undefined) out.pan_number = input.pan_number.trim() || null;
  if (input.mobile !== undefined) out.mobile = input.mobile.trim() || null;
  return out;
}

/** Find the account matching a statement's (broker, client_id). Null when no client id or no match. */
export function matchAccount(
  accounts: Array<{ id: string; label: string; broker: string; client_id: string | null }>,
  broker: string,
  clientId: string | null
): { id: string; label: string } | null {
  if (!clientId) return null;
  const hit = accounts.find((a) => a.broker === broker && a.client_id === clientId);
  return hit ? { id: hit.id, label: hit.label } : null;
}

/** Backfill a linked account's client_id only when it has none and the statement provides one. */
export function shouldBackfillClientId(account: { client_id: string | null }, clientId: string | null): boolean {
  return !account.client_id && !!clientId;
}

/** Classify a detected statement for the import review screen. */
export function classifyDetection(input: {
  clientId: string | null;
  matchedAccountId: string | null;
}): "matched" | "unmatched" | "no-client-id" {
  if (input.matchedAccountId) return "matched";
  if (input.clientId) return "unmatched";
  return "no-client-id";
}
