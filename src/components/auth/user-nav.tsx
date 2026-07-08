"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Upload, Settings, LogOut, Trash2 } from "lucide-react";
import type { Profile } from "@/types/database";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";

export function UserNav({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const initial = (profile.display_name?.[0] ?? "U").toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-primary/15 bg-accent text-sm font-semibold text-primary shadow-sm ring-offset-background transition-all hover:brightness-95 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {initial}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
          <div className="flex items-center gap-3 p-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/15 bg-accent text-base font-semibold text-primary">
              {initial}
            </div>
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-sm font-semibold text-foreground">
                {profile.display_name}
              </p>
              <p className="truncate text-xs text-muted-foreground" title={profile.email}>
                {profile.email}
              </p>
            </div>
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="lg:hidden gap-2.5 py-2"
            onClick={() => router.push("/dashboard")}
          >
            <LayoutDashboard className="text-muted-foreground" aria-hidden="true" />
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem
            className="lg:hidden gap-2.5 py-2"
            onClick={() => router.push("/import")}
          >
            <Upload className="text-muted-foreground" aria-hidden="true" />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2.5 py-2"
            onClick={() => router.push("/settings")}
          >
            <Settings className="text-muted-foreground" aria-hidden="true" />
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <ThemeToggle />

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            className="gap-2.5 py-2"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" />
            Delete Account
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            className="gap-2.5 py-2"
            onClick={handleSignOut}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
