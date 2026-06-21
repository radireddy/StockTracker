import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { LivePricesProvider } from "@/components/auto-refresh";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Try to get profile; if it doesn't exist yet (trigger delay), create it
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // Profile trigger may not have fired yet — create it manually
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader profile={profile} />
      <LivePricesProvider>
        <main className="px-4 md:px-8 py-4">{children}</main>
      </LivePricesProvider>
    </div>
  );
}
