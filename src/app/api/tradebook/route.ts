import { NextResponse } from "next/server";
import { getAuthUserOrNull } from "@/lib/supabase/server";
import { detectTradebookBroker } from "@/lib/import/tradebook-broker-registry";
import { executeTradebookImport } from "@/lib/import/tradebook-import-engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "tradebook-api" });
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit(user.id, RATE_LIMITS.import);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const adapter = detectTradebookBroker(buffer);
  if (!adapter) {
    return NextResponse.json(
      {
        error:
          "Unrecognised tradebook format. Upload a Zerodha tradebook XLSX (Console → Reports → Tradebook).",
      },
      { status: 422 }
    );
  }

  const parseResult = adapter.parse(buffer);
  const fatal = parseResult.errors.find((e) => e.severity === "error");
  if (fatal) return NextResponse.json({ error: fatal.message }, { status: 422 });

  if (parseResult.trades.length === 0) {
    return NextResponse.json({ error: "No equity trades found in the file." }, { status: 422 });
  }

  // ── Resolve account ──────────────────────────────────────────────────────
  const broker   = adapter.broker;
  const clientId = parseResult.metadata.client_id;

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "Could not read a Client ID from the tradebook. Ensure you downloaded from your Zerodha Console account.",
      },
      { status: 400 }
    );
  }

  let accountId: string;
  let accountLabel: string;

  const { data: existing } = await supabase
    .from("accounts")
    .select("id, label")
    .eq("broker", broker)
    .eq("client_id", clientId)
    .maybeSingle();

  if (existing) {
    accountId    = existing.id;
    accountLabel = existing.label;
  } else {
    const label = parseResult.metadata.account_label ?? `${clientId} (${adapter.displayName})`;
    const { data: created, error: cErr } = await supabase
      .from("accounts")
      .insert({ user_id: user.id, label, broker, client_id: clientId })
      .select("id, label")
      .single();
    if (cErr || !created) {
      log.error("Failed to create account", { error: cErr?.message });
      return NextResponse.json(
        { error: `Failed to create account: ${cErr?.message}` },
        { status: 500 }
      );
    }
    accountId    = created.id;
    accountLabel = created.label;
  }

  try {
    const result = await executeTradebookImport(
      user.id,
      accountId,
      accountLabel,
      parseResult,
      file.name
    );
    return NextResponse.json(result, {
      status: result.status === "failed" ? 500 : 200,
    });
  } catch (err) {
    log.error("Tradebook import error", { error: String(err) });
    return NextResponse.json({ error: "Import failed. Please try again." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const { data, error } = await supabase
      .from("import_tradebooks")
      .select("*, accounts(label, broker)")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("import_tradebooks")
    .select(
      "id, account_id, broker, client_id, date_from, date_to, file_name, status, imported_count, skipped_count, created_at, accounts(label, broker)"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function DELETE(request: Request) {
  const { supabase, user } = await getAuthUserOrNull();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("import_tradebooks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
