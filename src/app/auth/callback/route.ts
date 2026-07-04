import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";

const log = createLogger({ service: "auth-callback" });

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0]}***@${domain}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      log.info("Auth callback successful", {
        email: data.user?.email ? maskEmail(data.user.email) : undefined,
      });
      return NextResponse.redirect(`${origin}${next}`);
    }
    log.error("Auth code exchange failed", {
      error: error.message,
      code: error.status,
    });
  } else {
    log.warn("Auth callback called without code");
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
