import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import { getPortfolios } from "@/app/(authenticated)/actions/portfolio-actions";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let supabase, user;
  try {
    ({ supabase, user } = await getAuthUser());
  } catch {
    redirect("/login");
  }

  // Try to get profile; if it doesn't exist yet (trigger delay), create it
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

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

  const portfolios = await getPortfolios();
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
