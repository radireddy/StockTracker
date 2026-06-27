"use client";

import { useState } from "react";
import { Check, ChevronDown, Eye, Plus, Settings, Star } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Portfolio } from "@/types/database";
import { CreatePortfolioDialog } from "./create-portfolio-dialog";

type PortfolioWithCount = Portfolio & { company_count: number };

export function PortfolioDropdown({
  portfolios,
  selectedId,
  onSelect,
}: {
  portfolios: PortfolioWithCount[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const selected = portfolios.find((p) => p.id === selectedId);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground cursor-pointer" suppressHydrationWarning>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: selected?.color ?? "transparent" }}
              suppressHydrationWarning
            />
            <span className="max-w-[180px] truncate" suppressHydrationWarning>
              {selected?.name ?? "Select Portfolio"}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          {portfolios.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="flex items-center gap-2"
            >
              {p.color && (
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: p.color }}
                />
              )}
              <span className="truncate flex-1">{p.name}</span>
              {p.type === "watchlist" && (
                <Eye className="h-3.5 w-3.5 opacity-50 shrink-0" />
              )}
              {p.is_default && (
                <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
              )}
              {p.id === selectedId && (
                <Check className="h-4 w-4 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Portfolio
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { window.location.href = "/settings"; }}
          >
            <Settings className="h-4 w-4 mr-2" />
            Manage Portfolios
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreatePortfolioDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => onSelect(id)}
      />
    </>
  );
}
