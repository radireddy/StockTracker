import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // ┌─────────────────────────────────────────────────────────────────┐
  // │ SECURITY: This is the ONLY place that calls getUser() (HTTP    │
  // │ validation). All other auth checks use getSession() (local     │
  // │ JWT decode) via getAuthUser()/getAuthUserOrNull() in           │
  // │ src/lib/supabase/server.ts — they rely on THIS middleware      │
  // │ having already validated the token. DO NOT REMOVE.             │
  // └─────────────────────────────────────────────────────────────────┘
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const log = createLogger({ service: "auth-middleware" });

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/api/cron") &&
    !request.nextUrl.pathname.startsWith("/api/e2e-login")
  ) {
    log.warn("Unauthorized access, redirecting to login", {
      path: request.nextUrl.pathname,
    });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
