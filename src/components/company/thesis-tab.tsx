"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const highlightsEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Key highlights..." }),
    ],
    content: company.highlights ?? "",
  });

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, {
      thesis: thesisEditor?.getHTML(),
      highlights: highlightsEditor?.getHTML(),
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Investment Thesis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none min-h-[200px] rounded-md border p-3">
            <EditorContent editor={thesisEditor} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none min-h-[100px] rounded-md border p-3">
            <EditorContent editor={highlightsEditor} />
          </div>
        </CardContent>
      </Card>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
