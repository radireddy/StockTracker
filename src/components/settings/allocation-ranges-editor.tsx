"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAllocationRanges } from "@/app/(authenticated)/actions/settings-actions";
import { DEFAULT_ALLOCATION_RANGES } from "@/types/database";
import type { AllocationRanges } from "@/types/database";

export function AllocationRangesEditor({
  initialRanges,
}: {
  initialRanges: AllocationRanges | null;
}) {
  const [ranges, setRanges] = useState<AllocationRanges>(
    initialRanges ?? DEFAULT_ALLOCATION_RANGES
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const stars = [4, 3, 2, 1] as const;

  const updateRange = (star: number, field: "min" | "max", value: string) => {
    const num = value === "" ? 0 : parseFloat(value);
    if (isNaN(num)) return;
    setRanges((prev) => ({
      ...prev,
      [String(star)]: { ...prev[String(star)], [field]: num },
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAllocationRanges(ranges);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setRanges(DEFAULT_ALLOCATION_RANGES);
    setSaved(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure target allocation range (%) for each star rating.
      </p>
      <div className="space-y-3">
        {stars.map((star) => {
          const range = ranges[String(star)] ?? { min: 0, max: 0 };
          return (
            <div key={star} className="flex items-center gap-3">
              <span className="w-16 text-sm font-medium text-yellow-500" aria-label={`${star} star`}>
                <span aria-hidden="true">{"★".repeat(star)}</span>
              </span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                aria-label={`${star} star minimum allocation percent`}
                value={range.min}
                onChange={(e) => updateRange(star, "min", e.target.value)}
                className="w-20 h-8 text-sm text-center"
              />
              <span className="text-muted-foreground">%</span>
              <span className="text-muted-foreground" aria-hidden="true">—</span>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                aria-label={`${star} star maximum allocation percent`}
                value={range.max}
                onChange={(e) => updateRange(star, "max", e.target.value)}
                className="w-20 h-8 text-sm text-center"
              />
              <span className="text-muted-foreground">%</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
        {saved && (
          <span className="text-sm text-green-600">Saved!</span>
        )}
      </div>
    </div>
  );
}
