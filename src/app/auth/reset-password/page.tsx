import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Set new password" };

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">StockTracker</h1>
          <p className="text-sm text-muted-foreground">
            Track your investments with precision
          </p>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
