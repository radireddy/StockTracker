import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@/lib/logger";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";

export async function updateSession(request: NextRequest) {
  // Mint a per-request nonce and expose it to the app via a request header so
  // Next.js stamps it onto framework scripts and our inline script can read it.
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

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
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
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
    !request.nextUrl.pathname.startsWith("/api/cron")
  ) {
    log.warn("Unauthorized access, redirecting to login", {
      path: request.nextUrl.pathname,
    });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const redirectResponse = NextResponse.redirect(url);
    redirectResponse.headers.set("Content-Security-Policy", csp);
    return redirectResponse;
  }

  supabaseResponse.headers.set("Content-Security-Policy", csp);
  return supabaseResponse;
}
