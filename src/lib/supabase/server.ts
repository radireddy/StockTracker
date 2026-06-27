import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}

/**
 * Returns the authenticated user and Supabase client for server actions and layouts.
 *
 * SECURITY CONTRACT — READ BEFORE MODIFYING:
 * ─────────────────────────────────────────────
 * This function uses `getSession()` which decodes the JWT locally WITHOUT
 * making an HTTP call to the Supabase Auth server. This is intentionally
 * different from `supabase.auth.getUser()` which makes a network roundtrip.
 *
 * WHY THIS IS SAFE:
 * 1. Next.js middleware (`src/lib/supabase/middleware.ts`) calls `getUser()`
 *    on EVERY request before it reaches any server action or layout.
 *    Middleware is the single point of full JWT validation (signature,
 *    expiry, revocation).
 * 2. Within the same HTTP request, a token validated by middleware cannot
 *    become revoked — so local JWT decode is sufficient.
 * 3. Supabase RLS enforces `auth.uid() = user_id` on every DB query as
 *    a second layer of defense, using the same JWT from cookies.
 *
 * WHERE TO USE:
 * - Server actions in `src/app/(authenticated)/actions/`
 * - Server components in the `(authenticated)` route group
 * - Any route covered by the middleware matcher in `src/middleware.ts`
 *
 * WHERE NOT TO USE (will bypass auth!):
 * - Routes excluded from middleware (e.g., `/api/cron/*`)
 * - Standalone scripts or edge functions without middleware
 * - Any context where middleware does NOT run before this code
 *   In those cases, use `supabase.auth.getUser()` directly.
 *
 * @throws {Error} "Unauthorized" if no valid session exists
 * @returns {{ supabase: SupabaseClient, user: User }} — the client and authenticated user
 */
export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return { supabase, user: session.user as User };
}

/**
 * Returns the authenticated user (or null) and Supabase client for API routes.
 *
 * Same as `getAuthUser()` but returns `null` instead of throwing, so API routes
 * can return a proper 401 JSON response.
 *
 * SECURITY: Same contract as getAuthUser() — only safe in middleware-protected
 * routes. See getAuthUser() JSDoc for full details.
 *
 * @returns {{ supabase: SupabaseClient, user: User | null }}
 */
export async function getAuthUserOrNull() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return { supabase, user: (session?.user as User) ?? null };
}
