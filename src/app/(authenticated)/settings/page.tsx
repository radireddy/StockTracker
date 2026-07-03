import { getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PortfolioManager } from "@/components/settings/portfolio-manager";
import { AllocationRangesEditor } from "@/components/settings/allocation-ranges-editor";
import { getPortfolios } from "@/app/(authenticated)/actions/portfolio-actions";
import type { AllocationRanges } from "@/types/database";

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
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
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
      <Card>
        <CardHeader>
          <CardTitle>Allocation Ranges</CardTitle>
        </CardHeader>
        <CardContent>
          <AllocationRangesEditor
            initialRanges={(profile?.allocation_ranges as AllocationRanges | null) ?? null}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Portfolios</CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioManager portfolios={portfolios} />
        </CardContent>
      </Card>
    </div>
  );
}
