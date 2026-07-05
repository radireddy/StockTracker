import { getAuthUserOrNull } from "@/lib/supabase/server";
import { parseStatementBuffer } from "@/lib/import/parse-statement";
import { matchAccount } from "@/lib/accounts";
import { type BrokerType } from "@/lib/import/types";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * POST /api/import/detect
 * Parse-only pre-flight: reads each file's (broker, client_id) WITHOUT writing,
 * and reports whether it matches an existing account. Feeds the import review
 * screen so the user can link an unmatched statement to an existing account
 * instead of silently creating a duplicate.
 */
export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const brokerHint = (formData.get("broker") as BrokerType | null) ?? null;
  if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const { data: accounts } = await supabase.from("accounts").select("id, label, broker, client_id");
  const accountList = (accounts ?? []) as Array<{ id: string; label: string; broker: string; client_id: string | null }>;

  const results = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const parsed = parseStatementBuffer(buffer, brokerHint);
    if (!parsed.ok) {
      results.push({
        file_name: file.name,
        broker: null,
        client_id: null,
        statement_date: null,
        stock_count: 0,
        matched_account: null,
        parse_error: parsed.error,
      });
      continue;
    }
    const broker = parsed.adapter.broker;
    const clientId = parsed.parseResult.metadata.client_id;
    results.push({
      file_name: file.name,
      broker,
      client_id: clientId,
      statement_date: parsed.parseResult.metadata.statement_date,
      stock_count: parsed.parseResult.holdings.length,
      matched_account: matchAccount(accountList, broker, clientId),
      parse_error: null,
    });
  }

  return NextResponse.json({ results });
}
