"use client";

import Link from "next/link";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/types/database";

/**
 * Controlled account picker: choose an existing account. Accounts are created
 * only in Settings; when the user has none, this points them there.
 * Uses a custom Select (portal-rendered) to avoid native dropdown overlay
 * issues on mobile browsers.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  className,
  id,
}: {
  accounts: Account[];
  value: string; // "" | <account id>
  onChange: (value: string) => void;
  className?: string;
  id?: string;
}) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts yet.{" "}
        <Link href="/settings" className="text-primary underline underline-offset-2">
          Add one in Settings
        </Link>
        .
      </p>
    );
  }
  return (
    <Select value={value || null} onValueChange={(v) => onChange(v ?? "")}>
      <SelectTrigger id={id} className={`w-full ${className ?? ""}`}>
        <SelectValue placeholder="Select account…" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
