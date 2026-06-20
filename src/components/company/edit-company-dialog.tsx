"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import { roundPrice } from "@/lib/utils/calculations";
import type { Company } from "@/types/database";

export function EditCompanyDialog({ company }: { company: Company }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await updateCompany(company.id, {
        buy_price: fd.get("buy_price") ? roundPrice(Number(fd.get("buy_price"))) : null,
        star_rating: Number(fd.get("star_rating")) || 2,
        strategy: (fd.get("strategy") as "core" | "satellite") || null,
      });
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" />}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Company Details</DialogTitle>
        </DialogHeader>

        {/* Read-only stock info */}
        <div className="rounded-md border border-input bg-muted/50 px-3 py-2 mb-2">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{company.indian_stocks?.name ?? "Unknown"}</span>
            {company.indian_stocks?.nse_symbol && (
              <span className="text-sm text-muted-foreground">
                (NSE: {company.indian_stocks.nse_symbol})
              </span>
            )}
          </div>
          {company.indian_stocks?.sector && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {company.indian_stocks.sector}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-buy_price">Buy Price (₹)</Label>
              <Input
                id="edit-buy_price"
                name="buy_price"
                type="number"
                step="any"
                defaultValue={company.buy_price ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-star_rating">Star Rating *</Label>
              <Select
                name="star_rating"
                defaultValue={String(company.star_rating ?? 2)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} Star{s > 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-strategy">Strategy</Label>
              <Select
                name="strategy"
                defaultValue={company.strategy ?? ""}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="satellite">Satellite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-horizon">Horizon (years)</Label>
              <Input
                id="edit-horizon"
                type="number"
                value={company.investment_horizon_years ?? 0}
                readOnly
                disabled
                className="bg-muted cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Auto-calculated from Financial Model estimates
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
