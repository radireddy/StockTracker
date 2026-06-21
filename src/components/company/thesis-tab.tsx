"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updateCompany } from "@/app/(authenticated)/actions/company-actions";
import type { Company } from "@/types/database";

export function ThesisTab({ company }: { company: Company }) {
  const [saving, setSaving] = useState(false);
  const htmlRef = useRef(company.thesis ?? "");

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(company.id, { thesis: htmlRef.current });
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <RichTextEditor
        content={company.thesis ?? ""}
        placeholder="Write your investment thesis..."
        minHeight="200px"
        onChange={(html) => { htmlRef.current = html; }}
        companyId={company.id}
      />
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Thesis"}
      </Button>
    </div>
  );
}
