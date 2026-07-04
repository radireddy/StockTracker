import { Suspense } from "react";
import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShellData } from "@/components/layout/shell-data";
import { ShellSkeleton } from "@/components/layout/shell-skeleton";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fast local JWT decode (getSession) — no network. Middleware has already
  // fully validated the token, so this only gates unauthenticated access.
  let supabase, user;
  try {
    ({ supabase, user } = await getAuthUser());
  } catch {
    redirect("/login");
  }

  // The profile/portfolio DB queries live in <ShellData>, behind Suspense, so
  // the document <head> and asset preloads flush before they resolve —
  // browser JS/CSS download overlaps the server fetch instead of waiting on it.
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ShellData supabase={supabase} user={user}>
        {children}
      </ShellData>
    </Suspense>
  );
}
