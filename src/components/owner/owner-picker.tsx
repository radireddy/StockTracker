"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getOwners, createOwner } from "@/app/(authenticated)/actions/owner-actions";
import { Plus, Loader2, User } from "lucide-react";
import type { PortfolioOwner } from "@/types/database";

interface OwnerPickerProps {
  value: string;
  onChange: (ownerId: string) => void;
  disabled?: boolean;
}

export function OwnerPicker({ value, onChange, disabled }: OwnerPickerProps) {
  const [owners, setOwners] = useState<PortfolioOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOwners()
      .then((data) => {
        setOwners(data);
        // Auto-select default if no value set yet
        if (!value && data.length > 0) {
          const def = data.find((o) => o.is_default);
          onChange(def?.id ?? data[0].id);
        }
      })
      .catch(() => setOwners([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const owner = await createOwner({ name: newName.trim() });
      setOwners((prev) => [...prev, owner]);
      onChange(owner.id);
      setNewName("");
      setShowCreate(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          Tradebook Owner <span className="text-destructive">*</span>
        </label>
        <div className="flex items-center gap-2 text-sm text-muted-foreground h-9">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading owners...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium flex items-center gap-1.5">
        <User className="h-3.5 w-3.5" />
        Tradebook Owner <span className="text-destructive">*</span>
      </label>
      <p className="text-xs text-muted-foreground">
        Select the person whose trades are in this file
      </p>

      {!showCreate ? (
        <div className="flex gap-2">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="" disabled>
              Select owner...
            </option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.is_default ? " (default)" : ""}
                {o.pan_number ? ` — ${o.pan_number}` : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowCreate(true)}
            disabled={disabled}
            title="Add new owner"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
          <p className="text-sm font-medium">Add new owner</p>
          <Input
            placeholder="Name (e.g., Wife, Father)"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            autoFocus
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
