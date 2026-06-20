"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  createTimelineEntry,
  deleteTimelineEntry,
} from "@/app/(authenticated)/actions/timeline-actions";
import type { TimelineEntry } from "@/types/database";

export function TimelineTab({
  companyId,
  entries,
}: {
  companyId: string;
  entries: TimelineEntry[];
}) {
  const [quarter, setQuarter] = useState("");
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Add quarterly update..." }),
    ],
    content: "",
  });

  const handleAdd = async () => {
    if (!editor?.getHTML() || editor.isEmpty) return;
    setSaving(true);
    await createTimelineEntry(companyId, {
      quarter: quarter || undefined,
      entry_date: new Date().toISOString().split("T")[0],
      content: editor.getHTML(),
      sort_order: 0,
    });
    editor.commands.clearContent();
    setQuarter("");
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await deleteTimelineEntry(id, companyId);
  };

  return (
    <div className="space-y-4">
      {/* Add entry form */}
      <div className="space-y-3 pb-4 border-b border-border/50">
        <Input
          placeholder="Quarter (e.g., Q1FY26)"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          className="w-48"
        />
        <div className="prose prose-sm max-w-none min-h-[80px] rounded-md border border-border/50 p-3">
          <EditorContent editor={editor} />
        </div>
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          {saving ? "Adding..." : "Add Entry"}
        </Button>
      </div>

      {/* Entries list */}
      <div className="divide-y divide-border/30">
        {entries.map((entry) => (
          <div key={entry.id} className="py-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-sm">
                {entry.quarter && (
                  <span className="font-semibold">{entry.quarter}</span>
                )}
                {entry.entry_date && (
                  <span className="text-muted-foreground text-xs">{entry.entry_date}</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(entry.id)}
              >
                Delete
              </Button>
            </div>
            <div
              className="prose prose-sm max-w-none text-foreground/80"
              dangerouslySetInnerHTML={{ __html: entry.content }}
            />
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No timeline entries yet.
          </p>
        )}
      </div>
    </div>
  );
}
