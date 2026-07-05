"use client";

import Link from "next/link";
import type { Account } from "@/types/database";

/**
 * Controlled account picker: choose an existing account. Accounts are created
 * only in Settings; when the user has none, this points them there.
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
    <select
      id={id}
      aria-label="Account"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ${className ?? ""}`}
    >
      <option value="" disabled>
        Select account…
      </option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
