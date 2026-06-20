import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("*, companies(count)")
    .order("created_at");

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
          <CardTitle>Portfolios</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolios && portfolios.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {portfolios.map((p: Record<string, unknown>) => (
                <li key={p.id as string} className="flex items-center justify-between">
                  <span>{p.name as string}{p.is_default ? " (default)" : ""}</span>
                  <Badge variant="secondary">
                    {(p.companies as { count: number }[])?.[0]?.count ?? 0} companies
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No portfolios yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
