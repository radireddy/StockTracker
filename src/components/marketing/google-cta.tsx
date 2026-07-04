"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Marketing-page CTA that kicks off Google OAuth directly (one click) instead
 * of routing to /login first. Styling is passed in so it can match the various
 * landing-page button treatments. Mirrors the flow in
 * src/components/auth/login-button.tsx.
 */
export function GoogleCta({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <button type="button" onClick={handleLogin} className={className}>
      {children}
    </button>
  );
}
