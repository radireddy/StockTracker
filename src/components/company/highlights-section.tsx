"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company } from "@/types/database";

export function HighlightsSection({ company }: { company: Company }) {
  const [saving, setSaving] = useState(false);
  const htmlRef = useRef(company.highlights ?? "");

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, { highlights: htmlRef.current });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <RichTextEditor
        content={company.highlights ?? ""}
        placeholder="Key highlights..."
        minHeight="100px"
        onChange={(html) => { htmlRef.current = html; }}
        companyId={company.id}
        disableMedia
      />
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Highlights"}
      </Button>
    </div>
  );
}
