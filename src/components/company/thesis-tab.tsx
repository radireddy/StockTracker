"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company } from "@/types/database";

export function ThesisTab({ company }: { company: Company }) {
  const [saving, setSaving] = useState(false);

  const thesisEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write your investment thesis..." }),
    ],
    content: company.thesis ?? "",
  });

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, {
      thesis: thesisEditor?.getHTML(),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="prose prose-sm max-w-none min-h-[200px] rounded-md border border-border/50 p-3">
        <EditorContent editor={thesisEditor} />
      </div>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Thesis"}
      </Button>
    </div>
  );
}
