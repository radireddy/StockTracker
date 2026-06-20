import { LoginButton } from "@/components/auth/login-button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">StockTracker</h1>
          <p className="text-sm text-muted-foreground">
            Track your stock investments with precision
          </p>
        </div>
        <LoginButton />
      </div>
    </div>
  );
}
