"use client";

import type { DashboardAccount } from "@/hooks/use-dashboard-data";

interface AccountFilterProps {
  accounts: DashboardAccount[];
  value: string; // "all" or account ID
  onChange: (value: string) => void;
}

export function AccountFilter({ accounts, value, onChange }: AccountFilterProps) {
  // Only show the filter when there's more than one account to switch between.
  if (accounts.length <= 1) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="all">All accounts</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}
