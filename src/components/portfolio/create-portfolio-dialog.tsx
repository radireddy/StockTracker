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
import { Check } from "lucide-react";

const COLORS = [
  "#22c55e", "#3b82f6", "#eab308", "#f97316",
  "#ef4444", "#a855f7", "#6b7280", "#14b8a6",
];

export function CreatePortfolioDialog({
  open,
  onOpenChange,
  onCreated,
  defaultType = "holdings",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (portfolioId: string) => void;
  /** Portfolio type the form starts on when the dialog opens. */
  defaultType?: "holdings" | "watchlist";
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"holdings" | "watchlist">(defaultType);
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the type each time the dialog is opened so callers can steer it
  // (e.g. the watchlist empty-state opens straight into "watchlist"). Done as a
  // render-phase adjustment rather than an effect to avoid a cascading render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setType(defaultType);
  }

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
      setType(defaultType);
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
            <div className="flex flex-wrap gap-2.5">
              {COLORS.map((c) => {
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={selected}
                    className="group grid h-8 w-8 place-items-center rounded-full transition-transform duration-150 ease-out hover:scale-110 focus-visible:outline-none active:scale-95"
                    style={{
                      backgroundColor: c,
                      boxShadow: selected
                        ? `0 0 0 2px var(--popover), 0 0 0 4px ${c}`
                        : "inset 0 0 0 1px rgb(0 0 0 / 0.12)",
                    }}
                    onClick={() => setColor(c)}
                  >
                    <Check
                      strokeWidth={3}
                      className={`h-4 w-4 text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)] transition-all duration-150 ${
                        selected
                          ? "scale-100 opacity-100"
                          : "scale-50 opacity-0 group-hover:opacity-40 group-hover:scale-75"
                      }`}
                    />
                  </button>
                );
              })}
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
