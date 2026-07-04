"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updateCompany, getCompanyHighlights } from "@/app/(authenticated)/actions/company-actions";

export function HighlightsSection({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const htmlRef = useRef("");

  useEffect(() => {
    let active = true;
    getCompanyHighlights(companyId).then((highlights) => {
      if (!active) return;
      const html = highlights ?? "";
      setContent(html);
      htmlRef.current = html;
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [companyId]);

  const handleSave = async () => {
    setSaving(true);
    await updateCompany(companyId, { highlights: htmlRef.current });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <RichTextEditor
        content={content}
        placeholder="Key highlights..."
        minHeight="100px"
        onChange={(html) => { htmlRef.current = html; }}
        companyId={companyId}
        disableMedia
      />
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Highlights"}
      </Button>
    </div>
  );
}
