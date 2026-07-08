"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toastError } from "@/lib/toast-error";
import { deleteAccount } from "@/app/(authenticated)/actions/account-delete-actions";

interface DeleteAccountDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmation === "DELETE";
  const isControlled = open !== undefined;

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setConfirmation("");
    onOpenChange?.(isOpen);
  };

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        toastError(result);
        return;
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={isControlled ? open : undefined} onOpenChange={handleOpenChange}>
      {!isControlled && (
        <AlertDialogTrigger
          render={<Button variant="destructive" size="sm" className="gap-1.5 shrink-0" />}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Account
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately and permanently delete everything associated with
            your account — there is no undo, no recovery, and no grace period.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="px-0 space-y-3">
          <ul className="list-disc pl-4 space-y-1 text-left text-sm text-muted-foreground">
            <li>All portfolios (holdings and watchlists)</li>
            <li>All companies, research notes, financial models, and valuations</li>
            <li>All accounts and holdings data</li>
            <li>All import history</li>
            <li>All uploaded files</li>
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm" className="text-foreground">
              Type <span className="font-mono font-bold">DELETE</span> to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={deleting}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {deleting ? "Deleting…" : "Delete my account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
