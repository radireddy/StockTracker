"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { handleGridKeyDown } from "@/lib/grid-keyboard-nav";
import type { FinancialYear } from "@/types/database";
import type { RowConfig } from "@/lib/projections/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function oKey(field: string, yearIdx: number) {
  return `${field}-${yearIdx}`;
}

function isEstimate(yearStr: string): boolean {
  return yearStr.endsWith("E");
}

function fmt(val: number | null | undefined, format: "number" | "percent" | "ratio"): string {
  if (val == null) return "";
  if (format === "percent") {
    return `${Math.round(val)}%`;
  }
  if (format === "number") {
    return val.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  // ratio — 2 decimals
  return val.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProjectionGridProps {
  data: FinancialYear[];
  rowConfigs: RowConfig[];
  overrides: Set<string>;
  onCellChange: (yearIdx: number, key: string, value: string) => void;
  onYearChange: (idx: number, value: string) => void;
  onAddYear: () => void;
  onRemoveYear: (idx: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProjectionGrid({
  data,
  rowConfigs,
  overrides,
  onCellChange,
  onYearChange,
  onAddYear,
  onRemoveYear,
}: ProjectionGridProps) {
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);

  const autoKeys = new Set(rowConfigs.filter((r) => r.type === "auto").map((r) => r.key));
  const cellId = (key: string, idx: number) => `${key}-${idx}`;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Profit & Loss</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Figures in Rs. Crores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddYear}
            className="h-8 px-3 text-xs gap-1.5 rounded-full"
          >
            <Plus className="h-3.5 w-3.5" /> Add Year
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-border/40">
              <th className="sticky-col sticky left-0 z-30 py-3 pl-3 sm:pl-5 pr-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider min-w-[130px] sm:min-w-[180px]">
                &nbsp;
              </th>
              {data.map((fy, idx) => {
                const isEst = isEstimate(fy.year);
                const isEditingH = editingHeader === idx;
                return (
                  <th
                    key={idx}
                    scope="col"
                    className={`group py-3 px-3 text-right text-xs font-semibold tracking-wide min-w-[100px] ${
                      isEst
                        ? "text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
                        : "text-muted-foreground bg-background"
                    }`}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      {isEditingH ? (
                        <input
                          type="text"
                          className="w-20 h-6 text-right text-xs font-semibold bg-white dark:bg-slate-900 border border-blue-400/50 rounded px-1 outline-none focus:ring-1 focus:ring-blue-400/50"
                          defaultValue={fy.year}
                          autoFocus
                          onBlur={(e) => {
                            onYearChange(idx, e.target.value);
                            setEditingHeader(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onYearChange(idx, (e.target as HTMLInputElement).value);
                              setEditingHeader(null);
                            } else if (e.key === "Escape") {
                              setEditingHeader(null);
                            }
                          }}
                        />
                      ) : (
                        <span
                          className="cursor-text hover:underline decoration-dashed underline-offset-2"
                          onClick={() => setEditingHeader(idx)}
                          title="Click to edit"
                        >
                          {fy.year.replace("FY", "Mar 20")}
                        </span>
                      )}
                      {data.length > 1 && !isEditingH && (
                        <button
                          onClick={() => onRemoveYear(idx)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-opacity"
                          title={`Remove ${fy.year}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rowConfigs.map((row, rowIndex) => {
              const isAuto = row.type === "auto";
              const isPct = row.format === "percent";
              const isHighlight = row.section === "subtotal" || row.section === "total";
              const isHeader = row.section === "header";

              return (
                <tr
                  key={row.key}
                  className={[
                    "group/row transition-colors",
                    row.dividerAbove ? "border-t border-border/40" : "",
                    isHighlight
                      ? "bg-muted/40 dark:bg-muted/20 border-t border-border/30"
                      : "border-b border-border/10",
                    !isHighlight && !isPct ? "hover:bg-muted/20" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {/* Label */}
                  <th
                    scope="row"
                    className={`sticky left-0 z-10 py-2 pl-3 sm:pl-5 pr-3 whitespace-nowrap text-left font-normal ${
                      isHighlight
                        ? "sticky-col-highlight font-bold text-foreground"
                        : isHeader
                        ? "sticky-col font-semibold text-foreground"
                        : isPct
                        ? "sticky-col text-muted-foreground text-xs pl-6 sm:pl-8"
                        : "sticky-col text-foreground/80"
                    }`}
                  >
                    {row.label}
                  </th>

                  {/* Values */}
                  {data.map((fy, idx) => {
                    const val = fy[row.key as keyof FinancialYear] as number | null;
                    const isOverridden = isAuto && overrides.has(oKey(row.key, idx));
                    const isEst = isEstimate(fy.year);
                    const cid = cellId(row.key, idx);
                    const isEditing = editingCell === cid;
                    const isGrowth = row.key.includes("growth");

                    const estBg = isEst ? "bg-blue-50/30 dark:bg-blue-950/10" : "";
                    const highlightBg = isHighlight
                      ? isEst
                        ? "bg-blue-50/50 dark:bg-blue-950/15"
                        : "bg-muted/40 dark:bg-muted/20"
                      : "";

                    // Overridable auto fields: always show input
                    if (row.overridable && isAuto) {
                      const inputVal = isOverridden ? (val ?? "") : (val ?? "");
                      return (
                        <td
                          key={fy.year}
                          className={`py-1 px-1 ${highlightBg || estBg}`}
                        >
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="any"
                              data-row={rowIndex}
                              data-col={idx}
                              className={`w-full h-8 text-right text-sm tabular-nums rounded outline-none transition-all ${
                                inputVal === ""
                                  ? "bg-muted/30 border border-dashed border-border/60 hover:border-border hover:bg-muted/50"
                                  : "border border-transparent bg-transparent hover:bg-muted/30"
                              } focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/50 ${
                                isOverridden
                                  ? "text-violet-600 dark:text-violet-400"
                                  : ""
                              } ${isHighlight ? "font-bold" : ""} px-2`}
                              value={inputVal}
                              onChange={(e) =>
                                onCellChange(idx, row.key, e.target.value)
                              }
                              onKeyDown={handleGridKeyDown}
                              placeholder=""
                            />
                          </div>
                        </td>
                      );
                    }

                    // Editable cell (non-locked, non-auto OR overridden auto OR editing auto)
                    if ((!isAuto || isEditing || isOverridden) && !row.locked) {
                      const inputVal = isAuto ? (isOverridden ? (val ?? "") : (val ?? "")) : (val ?? "");
                      return (
                        <td
                          key={fy.year}
                          className={`py-1 px-1 ${highlightBg || estBg}`}
                        >
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              step="any"
                              data-row={rowIndex}
                              data-col={idx}
                              className={`w-full h-8 text-right text-sm tabular-nums rounded outline-none transition-all ${
                                inputVal === ""
                                  ? "bg-muted/30 border border-dashed border-border/60 hover:border-border hover:bg-muted/50"
                                  : "border border-transparent bg-transparent hover:bg-muted/30"
                              } focus:bg-white dark:focus:bg-slate-900 focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/50 ${
                                isOverridden
                                  ? "text-violet-600 dark:text-violet-400"
                                  : ""
                              } ${isHighlight ? "font-bold" : ""} ${
                                isPct ? "text-xs text-muted-foreground pr-4 px-1" : "px-2"
                              }`}
                              value={inputVal}
                              onChange={(e) =>
                                onCellChange(idx, row.key, e.target.value)
                              }
                              onBlur={() => {
                                if (isAuto && !isOverridden) setEditingCell(null);
                              }}
                              onKeyDown={handleGridKeyDown}
                              placeholder=""
                              autoFocus={isEditing}
                            />
                            {isPct && inputVal !== "" && (
                              <span className="absolute right-1 text-xs text-muted-foreground pointer-events-none">%</span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // Auto-computed display cell
                    const growthColor =
                      isGrowth && val != null
                        ? val > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : val < 0
                          ? "text-red-500 dark:text-red-400"
                          : ""
                        : "";

                    const negativeColor =
                      !isGrowth && !isPct && val != null && val < 0
                        ? "text-red-500 dark:text-red-400"
                        : "";

                    return (
                      <td
                        key={fy.year}
                        className={`py-2 px-3 text-right ${row.locked ? "" : "cursor-text"} ${highlightBg || estBg}`}
                        onClick={row.locked ? undefined : () => setEditingCell(cid)}
                      >
                        <span
                          className={`text-sm tabular-nums ${
                            isHighlight
                              ? "font-bold text-foreground"
                              : isPct
                              ? "text-xs text-muted-foreground"
                              : growthColor ||
                                negativeColor ||
                                "text-foreground/80"
                          }`}
                        >
                          {fmt(val, row.format) || (
                            <span className="text-muted-foreground/25">
                              &mdash;
                            </span>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground px-1">
        <span>Click any auto-calculated cell to override</span>
        <span className="text-violet-500">Purple = manually overridden</span>
        <span className="text-blue-500">Blue columns = estimates</span>
      </div>
    </div>
  );
}
