import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { PortfolioManager } from "@/components/settings/portfolio-manager";
import { AllocationRangesEditor } from "@/components/settings/allocation-ranges-editor";
import { AccountsManager } from "@/components/account/accounts-manager";
import { getPortfolios } from "@/app/(authenticated)/actions/portfolio-actions";
import type { AllocationRanges } from "@/types/database";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  let supabase, user;
  try {
    ({ supabase, user } = await getAuthUser());
  } catch {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const portfolios = await getPortfolios();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Name:</strong> {profile?.display_name}</p>
          <p><strong>Email:</strong> {profile?.email}</p>
          <p>
            <strong>Plan:</strong>{" "}
            <Badge variant="outline">{profile?.plan ?? "free"}</Badge>
          </p>
        </CardContent>
      </Card>
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Allocation Ranges</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationRangesEditor
            initialRanges={(profile?.allocation_ranges as AllocationRanges | null) ?? null}
          />
        </CardContent>
      </Card>
      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>Portfolios</CardTitle>
          <CardDescription>
            Star a portfolio to make it the default — it&rsquo;s the one your
            dashboard opens on. Only one portfolio (holdings or watchlist) can
            be the default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PortfolioManager portfolios={portfolios} />
        </CardContent>
      </Card>
      <AccountsManager />
    </div>
  );
}
