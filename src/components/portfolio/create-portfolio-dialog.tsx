"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createPortfolio } from "@/app/(authenticated)/actions/portfolio-actions";

const COLORS = [
  "#22c55e", "#3b82f6", "#eab308", "#f97316",
  "#ef4444", "#a855f7", "#6b7280", "#14b8a6",
];

export function CreatePortfolioDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (portfolioId: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"holdings" | "watchlist">("holdings");
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) return;
    setPending(true);
    setError(null);

    try {
      const portfolio = await createPortfolio({
        name: name.trim(),
        type,
        color,
        description: description.trim() || undefined,
      });
      onOpenChange(false);
      setName("");
      setDescription("");
      setType("holdings");
      setColor(COLORS[0]);
      router.refresh();
      onCreated?.(portfolio.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to create portfolio";
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Portfolio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Core Holdings"
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as "holdings" | "watchlist")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="holdings" id="type-holdings" />
                <Label htmlFor="type-holdings">Holdings</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="watchlist" id="type-watchlist" />
                <Label htmlFor="type-watchlist">Watchlist</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    color === c
                      ? "border-foreground scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description (optional)</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={pending || !name.trim()}
          >
            {pending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
