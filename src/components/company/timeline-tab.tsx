"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import type { Editor } from "@tiptap/react";
import {
  getTimelineEntries,
  createTimelineEntry,
  updateTimelineEntry,
  deleteTimelineEntry,
} from "@/app/(authenticated)/actions/timeline-actions";
import type { TimelineEntry } from "@/types/database";

const PAGE_SIZE = 5;

export function TimelineTab({ companyId }: { companyId: string }) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [quarter, setQuarter] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuarter, setEditQuarter] = useState("");
  const htmlRef = useRef("");
  const editorRef = useRef<Editor | null>(null);
  const editHtmlRef = useRef("");
  const editEditorRef = useRef<Editor | null>(null);

  const fetchEntries = useCallback(() => {
    setLoading(true);
    getTimelineEntries(companyId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const setEditor = useCallback((editor: Editor | null) => {
    editorRef.current = editor;
  }, []);

  const setEditEditor = useCallback((editor: Editor | null) => {
    editEditorRef.current = editor;
  }, []);

  const handleAdd = async () => {
    if (!htmlRef.current || editorRef.current?.isEmpty) return;
    setSaving(true);
    await createTimelineEntry(companyId, {
      quarter: quarter || undefined,
      entry_date: new Date().toISOString().split("T")[0],
      content: htmlRef.current,
      sort_order: 0,
    });
    editorRef.current?.commands.clearContent();
    htmlRef.current = "";
    setQuarter("");
    setSaving(false);
    fetchEntries();
  };

  const handleEdit = (entry: TimelineEntry) => {
    setEditingId(entry.id);
    setEditQuarter(entry.quarter || "");
    editHtmlRef.current = entry.content;
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditQuarter("");
    editHtmlRef.current = "";
  };

  const handleSaveEdit = async (entry: TimelineEntry) => {
    if (!editHtmlRef.current || editEditorRef.current?.isEmpty) return;
    setSaving(true);
    await updateTimelineEntry(entry.id, companyId, {
      quarter: editQuarter || undefined,
      content: editHtmlRef.current,
    });
    setEditingId(null);
    setSaving(false);
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    await deleteTimelineEntry(id, companyId);
    fetchEntries();
  };

  // Sort newest first by created_at
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const visible = sorted.slice(0, visibleCount);
  const hasMore = sorted.length > visibleCount;

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-xs text-muted-foreground">
        Track quarterly results, earnings call summaries, management guidance, annual updates,
        or any company-related notes and references worth keeping on record.
      </p>

      {/* Add entry form */}
      <div className="space-y-3 pb-4 border-b border-border/50">
        <Input
          placeholder="Quarter / Label (e.g., Q1FY26, Annual Report)"
          value={quarter}
          onChange={(e) => setQuarter(e.target.value)}
          className="w-64"
        />
        <RichTextEditor
          placeholder="Add an update, note, or summary..."
          minHeight="80px"
          onChange={(html) => { htmlRef.current = html; }}
          editorRef={setEditor}
          companyId={companyId}
        />
        <Button size="sm" onClick={handleAdd} disabled={saving}>
          {saving ? "Adding..." : "Add Entry"}
        </Button>
      </div>

      {/* Entries list */}
      {loading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading timeline...</p>
      ) : (
        <div className="divide-y divide-border/30">
          {visible.map((entry) => (
            <div key={entry.id} className="py-3">
              {editingId === entry.id ? (
                <div className="space-y-3">
                  <Input
                    placeholder="Quarter / Label (e.g., Q1FY26)"
                    value={editQuarter}
                    onChange={(e) => setEditQuarter(e.target.value)}
                    className="w-64"
                  />
                  <RichTextEditor
                    placeholder="Edit entry..."
                    minHeight="80px"
                    content={entry.content}
                    onChange={(html) => { editHtmlRef.current = html; }}
                    editorRef={setEditEditor}
                    companyId={companyId}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleSaveEdit(entry)} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      {entry.quarter && (
                        <span className="font-semibold">{entry.quarter}</span>
                      )}
                      {entry.entry_date && (
                        <span className="text-muted-foreground text-xs">{entry.entry_date}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleEdit(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div
                    className="prose prose-sm max-w-none text-foreground/80"
                    dangerouslySetInnerHTML={{ __html: entry.content }}
                  />
                </>
              )}
            </div>
          ))}
          {entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No timeline entries yet.
            </p>
          )}
        </div>
      )}

      {/* Show More */}
      {hasMore && (
        <div className="text-center pt-2">
          <Button
            variant="link"
            size="sm"
            className="text-xs"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Show More ({sorted.length - visibleCount} remaining)
          </Button>
        </div>
      )}
    </div>
  );
}
