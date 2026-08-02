import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import type { EmailOtpType } from "@supabase/supabase-js";

const log = createLogger({ service: "auth-confirm" });

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  if (!token_hash || !type) {
    log.warn("Auth confirm called without token_hash or type");
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type });

  if (error) {
    log.error("OTP verification failed", { type, error: error.message });
    if (type === "recovery") {
      return NextResponse.redirect(
        `${origin}/login/forgot-password?error=link_expired`
      );
    }
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  log.info("OTP verified", { type });
  return NextResponse.redirect(`${origin}${next}`);
}
