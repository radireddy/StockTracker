"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Star, Trash2, ArrowUp, ArrowDown, Check, Pencil } from "lucide-react";
import {
  getPortfolios,
  updatePortfolio,
  deletePortfolio,
  setDefaultPortfolio,
  reorderPortfolios,
  getPortfolioDeletionSummary,
} from "@/app/(authenticated)/actions/portfolio-actions";
import { CreatePortfolioDialog } from "@/components/portfolio/create-portfolio-dialog";
import type { Portfolio } from "@/types/database";

type PortfolioWithCount = Portfolio & { company_count: number };

const COLORS = [
  "#22c55e", "#3b82f6", "#eab308", "#f97316",
  "#ef4444", "#a855f7", "#6b7280", "#14b8a6",
];

export function PortfolioManager({
  portfolios: initialPortfolios,
}: {
  portfolios: PortfolioWithCount[];
}) {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PortfolioWithCount | null>(null);
  const [deleteSummary, setDeleteSummary] = useState<{
    companies: number;
    holdings: number;
  } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleRename(id: string) {
    if (!editName.trim()) return;
    setPending(true);
    try {
      await updatePortfolio(id, { name: editName.trim() });
      setPortfolios((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: editName.trim() } : p))
      );
      setEditingId(null);
    } catch {
      // silently fail
    } finally {
      setPending(false);
    }
  }

  async function handleColorChange(id: string, color: string) {
    await updatePortfolio(id, { color });
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, color } : p))
    );
  }

  async function handleSetDefault(id: string) {
    setPending(true);
    try {
      await setDefaultPortfolio(id);
      setPortfolios((prev) =>
        prev.map((p) => ({ ...p, is_default: p.id === id }))
      );
    } catch {
      // silently fail
    } finally {
      setPending(false);
    }
  }

  async function handleDeleteClick(p: PortfolioWithCount) {
    try {
      const summary = await getPortfolioDeletionSummary(p.id);
      setDeleteSummary(summary);
      setDeleteTarget(p);
    } catch {
      // silently fail
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setPending(true);
    try {
      await deletePortfolio(deleteTarget.id);
      setPortfolios((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      setDeleteSummary(null);
      router.refresh();
    } catch {
      // silently fail
    } finally {
      setPending(false);
    }
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const idx = portfolios.findIndex((p) => p.id === id);
    if (
      (direction === "up" && idx <= 0) ||
      (direction === "down" && idx >= portfolios.length - 1)
    )
      return;

    const newList = [...portfolios];
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];

    // Update sort_order
    const ordered = newList.map((p, i) => ({ ...p, sort_order: i }));
    setPortfolios(ordered);

    await reorderPortfolios(ordered.map((p) => p.id));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {portfolios.length} portfolio{portfolios.length !== 1 ? "s" : ""}
        </h3>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          + New Portfolio
        </Button>
      </div>

      <div className="space-y-2">
        {portfolios.map((p, idx) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5"
          >
            {/* Color dot */}
            <div className="relative group">
              <span
                className="h-3 w-3 rounded-full block cursor-pointer"
                style={{ backgroundColor: p.color ?? "#6b7280" }}
              />
              <div className="hidden group-hover:flex absolute top-6 left-0 z-10 gap-1 bg-popover p-2 rounded-lg shadow-lg border">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`h-5 w-5 rounded-full border ${
                      p.color === c ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => handleColorChange(p.id, c)}
                  />
                ))}
              </div>
            </div>

            {/* Name */}
            {editingId === p.id ? (
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(p.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => handleRename(p.id)}
                  disabled={pending}
                >
                  <Check size={14} />
                </Button>
              </div>
            ) : (
              <span
                className="flex-1 text-sm font-medium cursor-pointer"
                onClick={() => {
                  setEditingId(p.id);
                  setEditName(p.name);
                }}
              >
                {p.name}
              </span>
            )}

            {/* Type badge */}
            <Badge variant="secondary" className="text-xs">
              {p.type === "watchlist" ? (
                <span className="flex items-center gap-1">
                  <Eye size={10} /> Watchlist
                </span>
              ) : (
                "Holdings"
              )}
            </Badge>

            {/* Count */}
            <span className="text-xs text-muted-foreground w-16 text-right">
              {p.company_count} stocks
            </span>

            {/* Actions */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => handleMove(p.id, "up")}
                disabled={idx === 0}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move up"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => handleMove(p.id, "down")}
                disabled={idx === portfolios.length - 1}
                className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move down"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => {
                  setEditingId(p.id);
                  setEditName(p.name);
                }}
                className="p-1 text-muted-foreground hover:text-foreground"
                title="Rename"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleSetDefault(p.id)}
                className={`p-1 ${
                  p.is_default
                    ? "text-amber"
                    : "text-muted-foreground hover:text-amber"
                }`}
                title={p.is_default ? "Default portfolio" : "Set as default"}
                disabled={p.is_default}
              >
                <Star size={14} fill={p.is_default ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => handleDeleteClick(p)}
                className="p-1 text-muted-foreground hover:text-destructive"
                title="Delete"
                disabled={p.is_default || portfolios.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <CreatePortfolioDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async () => {
          const updated = await getPortfolios();
          setPortfolios(updated);
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteSummary(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <strong>{deleteSummary?.companies ?? 0}</strong> companies and{" "}
              <strong>{deleteSummary?.holdings ?? 0}</strong> holdings.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting..." : "Delete Portfolio"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
