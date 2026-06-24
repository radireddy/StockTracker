"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Scissors,
  Gift,
  GitBranch,
  ArrowLeftRight,
  Tag,
  Check,
  X,
  Trash2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";

type CorporateAction = {
  id: string;
  symbol: string;
  isin: string;
  action_type: string;
  ex_date: string;
  ratio_from: number | null;
  ratio_to: number | null;
  new_symbol: string | null;
  new_isin: string | null;
  old_symbol: string | null;
  parent_cost_pct: number | null;
  status: "pending" | "confirmed" | "dismissed";
  source: string;
  notes: string | null;
  created_at: string;
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  STOCK_SPLIT: <Scissors className="h-4 w-4" />,
  BONUS: <Gift className="h-4 w-4" />,
  DEMERGER: <GitBranch className="h-4 w-4" />,
  MERGER: <ArrowLeftRight className="h-4 w-4" />,
  SYMBOL_RENAME: <Tag className="h-4 w-4" />,
};

const TYPE_LABELS: Record<string, string> = {
  STOCK_SPLIT: "Stock Split",
  BONUS: "Bonus Issue",
  DEMERGER: "Demerger",
  MERGER: "Merger",
  SYMBOL_RENAME: "Symbol Rename",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  confirmed: "bg-green-500/10 text-green-700 dark:text-green-400",
  dismissed: "bg-muted text-muted-foreground",
};

export default function CorporateActionsPage() {
  const [actions, setActions] = useState<CorporateAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "dismissed">("all");

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`/api/corporate-actions${params}`);
      if (res.ok) setActions(await res.json());
    } catch {
      toast.error("Failed to load corporate actions");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  const pendingCount = actions.filter((a) => a.status === "pending").length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Corporate Actions
          </CardTitle>
          <CardDescription>
            Detected stock splits, bonuses, demergers, and other corporate events
            that affect your holdings. Confirm or dismiss each detection, or add
            details manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-2">
            {(["all", "pending", "confirmed", "dismissed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === "pending" && pendingCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full bg-orange-500 text-white text-[10px]">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">
                {filter === "all"
                  ? "No corporate actions detected yet. Import tradebooks to detect anomalies."
                  : `No ${filter} corporate actions.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <CorporateActionCard
                  key={action.id}
                  action={action}
                  onUpdate={fetchActions}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CorporateActionCard({
  action,
  onUpdate,
}: {
  action: CorporateAction;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(action.status === "pending");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [actionType, setActionType] = useState(action.action_type);
  const [exDate, setExDate] = useState(action.ex_date);
  const [ratioFrom, setRatioFrom] = useState(String(action.ratio_from ?? ""));
  const [ratioTo, setRatioTo] = useState(String(action.ratio_to ?? ""));
  const [newSymbol, setNewSymbol] = useState(action.new_symbol ?? "");
  const [newIsin, setNewIsin] = useState(action.new_isin ?? "");

  const handleAction = async (status: "pending" | "confirmed" | "dismissed") => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { id: action.id, status };
      if (editing) {
        body.action_type = actionType;
        body.ex_date = exDate;
        if (ratioFrom) body.ratio_from = parseInt(ratioFrom);
        if (ratioTo) body.ratio_to = parseInt(ratioTo);
        if (newSymbol) body.new_symbol = newSymbol;
        if (newIsin) body.new_isin = newIsin;
      }

      const res = await fetch("/api/corporate-actions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(
          status === "confirmed"
            ? `${action.symbol} corporate action confirmed`
            : `${action.symbol} corporate action dismissed`
        );
        onUpdate();
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to update");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/corporate-actions?id=${action.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success(`Deleted ${action.symbol} corporate action`);
        onUpdate();
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-md border ${
        action.status === "pending" ? "border-orange-500/30" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <span className="text-muted-foreground shrink-0">
          {TYPE_ICONS[action.action_type] ?? <AlertTriangle className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-primary">{action.symbol}</span>
            {action.old_symbol && (
              <span className="text-xs text-muted-foreground">(was {action.old_symbol})</span>
            )}
            {action.new_symbol && action.action_type === "SYMBOL_RENAME" && (
              <span className="text-xs text-muted-foreground">→ {action.new_symbol}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {TYPE_LABELS[action.action_type] ?? action.action_type}
            </Badge>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[action.status]}`}
            >
              {action.status}
            </Badge>
            {action.ratio_from != null && action.ratio_to != null && (
              <span className="text-[10px] text-muted-foreground">
                {action.ratio_from}:{action.ratio_to}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {action.ex_date}
            </span>
          </div>
          {action.notes && !expanded && (
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
              {action.notes}
            </p>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t space-y-3">
          {action.notes && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {action.notes}
            </p>
          )}

          {/* Detail row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">ISIN: </span>
              <span className="font-mono">{action.isin}</span>
            </div>
            {action.new_isin && (
              <div>
                <span className="text-muted-foreground">New ISIN: </span>
                <span className="font-mono">{action.new_isin}</span>
              </div>
            )}
            {action.new_symbol && (
              <div>
                <span className="text-muted-foreground">New symbol: </span>
                <span className="font-medium">{action.new_symbol}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Source: </span>
              <span>{action.source === "auto_detected" ? "Auto-detected" : action.source}</span>
            </div>
          </div>

          {/* Edit form */}
          {editing && (
            <div className="space-y-3 p-3 rounded-md bg-muted/50">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Action Type</label>
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    <option value="STOCK_SPLIT">Stock Split</option>
                    <option value="BONUS">Bonus Issue</option>
                    <option value="DEMERGER">Demerger</option>
                    <option value="MERGER">Merger</option>
                    <option value="SYMBOL_RENAME">Symbol Rename</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">Ex-Date</label>
                  <input
                    type="date"
                    value={exDate}
                    onChange={(e) => setExDate(e.target.value)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">
                    Ratio From
                    {actionType === "STOCK_SPLIT" && " (old shares)"}
                    {actionType === "BONUS" && " (bonus shares)"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={ratioFrom}
                    onChange={(e) => setRatioFrom(e.target.value)}
                    placeholder="e.g. 1"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium">
                    Ratio To
                    {actionType === "STOCK_SPLIT" && " (new shares)"}
                    {actionType === "BONUS" && " (held shares)"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={ratioTo}
                    onChange={(e) => setRatioTo(e.target.value)}
                    placeholder="e.g. 5"
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                </div>
                {(actionType === "DEMERGER" || actionType === "SYMBOL_RENAME") && (
                  <>
                    <div>
                      <label className="text-xs font-medium">New Symbol</label>
                      <input
                        type="text"
                        value={newSymbol}
                        onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                        placeholder="e.g. ITCHOTELS"
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium">New ISIN</label>
                      <input
                        type="text"
                        value={newIsin}
                        onChange={(e) => setNewIsin(e.target.value.toUpperCase())}
                        placeholder="e.g. INE379A01028"
                        className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      />
                    </div>
                  </>
                )}
              </div>

              {actionType === "STOCK_SPLIT" && (
                <p className="text-[10px] text-muted-foreground">
                  For a 1:5 split (1 old share becomes 5 new shares): Ratio From = 1, Ratio To = 5
                </p>
              )}
              {actionType === "BONUS" && (
                <p className="text-[10px] text-muted-foreground">
                  For a 2:1 bonus (2 free shares for every 1 held): Ratio From = 2, Ratio To = 1
                </p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {action.status === "pending" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(!editing)}
                  disabled={saving}
                  className="text-xs"
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  {editing ? "Cancel Edit" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAction("confirmed")}
                  disabled={saving}
                  className="text-xs"
                >
                  {saving ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleAction("dismissed")}
                  disabled={saving}
                  className="text-xs text-muted-foreground"
                >
                  <X className="h-3 w-3 mr-1" />
                  Dismiss
                </Button>
              </>
            )}
            {action.status !== "pending" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleAction("pending")}
                disabled={saving}
                className="text-xs"
              >
                Reopen
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={saving}
              className="text-xs text-destructive hover:text-destructive ml-auto"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
