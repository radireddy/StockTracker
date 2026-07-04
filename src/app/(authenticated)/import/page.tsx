import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getAccounts } from "@/app/(authenticated)/actions/account-actions";
import ImportClient, { type HistoryRow } from "./import-client";

/**
 * Server component: fetches import history and accounts in parallel on the
 * server (in the already-authenticated request) and hands them to the client
 * as initial data. This removes the post-hydration fetch waterfall that made
 * the page slow to become useful.
 */
export default async function ImportPage() {
  let supabase, user;
  try {
    ({ supabase, user } = await getAuthUser());
  } catch {
    redirect("/login");
  }

  const [historyResult, accounts] = await Promise.all([
    supabase
      .from("import_holdings")
      .select(
        "id, portfolio_id, account_id, broker, client_id, statement_date, file_name, status, is_reimport, companies_count, imported_count, skipped_count, created_at, accounts(label, broker)"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    getAccounts(),
  ]);

  const history = (historyResult.data ?? []) as unknown as HistoryRow[];

  return <ImportClient initialHistory={history} initialAccounts={accounts} />;
}
