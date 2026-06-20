"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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
      <Card>
        <CardHeader>
          <CardTitle>Add Update</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Quarter (e.g., Q1FY26)"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="w-48"
          />
          <div className="prose prose-sm max-w-none min-h-[80px] rounded-md border p-3">
            <EditorContent editor={editor} />
          </div>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? "Adding..." : "Add Entry"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {entry.quarter && (
                    <span className="font-semibold text-foreground">
                      {entry.quarter}
                    </span>
                  )}
                  {entry.entry_date && <span>{entry.entry_date}</span>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(entry.id)}
                >
                  Delete
                </Button>
              </div>
              <Separator className="mb-2" />
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: entry.content }}
              />
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No timeline entries yet. Add your first quarterly update above.
          </p>
        )}
      </div>
    </div>
  );
}
