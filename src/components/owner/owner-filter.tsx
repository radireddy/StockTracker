"use client";

import type { PortfolioOwner } from "@/types/database";

interface OwnerFilterProps {
  owners: PortfolioOwner[];
  value: string; // "all" or owner ID
  onChange: (value: string) => void;
}

export function OwnerFilter({ owners, value, onChange }: OwnerFilterProps) {
  // Only show filter if there are multiple owners
  if (owners.length <= 1) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <option value="all">All Owners</option>
      {owners.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
