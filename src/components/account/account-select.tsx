"use client";

import { Input } from "@/components/ui/input";
import type { Account } from "@/types/database";

/** Sentinel value meaning "create a new account". */
export const NEW_ACCOUNT = "__new__";

/**
 * Controlled account picker: choose an existing account or "+ New account…".
 * When "+ New account…" is chosen, an inline name input appears.
 */
export function AccountSelect({
  accounts,
  value,
  onChange,
  newLabel,
  onNewLabelChange,
  className,
}: {
  accounts: Account[];
  value: string; // "" | <account id> | NEW_ACCOUNT
  onChange: (value: string) => void;
  newLabel: string;
  onNewLabelChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className="space-y-2">
      <select
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
        <option value={NEW_ACCOUNT}>+ New account…</option>
      </select>
      {value === NEW_ACCOUNT && (
        <Input
          placeholder="New account name (e.g. Father – Groww)"
          value={newLabel}
          onChange={(e) => onNewLabelChange(e.target.value)}
          className="h-9"
        />
      )}
    </div>
  );
}
