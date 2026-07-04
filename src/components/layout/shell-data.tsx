import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { getPortfolios } from "@/app/(authenticated)/actions/portfolio-actions";

/**
 * Async server component holding the authenticated shell's data dependencies
 * (profile + portfolios). Rendered inside a <Suspense> boundary in the layout
 * so the document <head> and asset preloads flush before these DB queries
 * resolve — browser JS/CSS download then overlaps the server fetch.
 */
export async function ShellData({
  supabase,
  user,
  children,
}: {
  supabase: SupabaseClient;
  user: User;
  children: React.ReactNode;
}) {
  const [profileResult, portfolios] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getPortfolios(),
  ]);

  let profile = profileResult.data;

  if (!profile) {
    const { data: newProfile } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        display_name: user.user_metadata?.full_name || user.email,
        avatar_url: user.user_metadata?.avatar_url,
      })
      .select()
      .single();
    profile = newProfile;
  }

  if (!profile) redirect("/login");

  const defaultPortfolioId =
    portfolios.find((p) => p.is_default)?.id ?? portfolios[0]?.id ?? "";

  return (
    <AuthenticatedShell
      profile={profile}
      portfolios={portfolios}
      defaultPortfolioId={defaultPortfolioId}
    >
      {children}
    </AuthenticatedShell>
  );
}
