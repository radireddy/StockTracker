"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { updateCompany, getCompanyHighlights } from "@/app/(authenticated)/actions/company-actions";
import { useAutoSave } from "@/hooks/use-auto-save";

export function HighlightsSection({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
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
    return () => { active = false; };
  }, [companyId]);

  const saveFn = useCallback(
    (html: string) => updateCompany(companyId, { highlights: html }),
    [companyId]
  );
  const autoSave = useAutoSave(saveFn, { delay: 1000 });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <RichTextEditor
      content={content}
      placeholder="Key highlights..."
      minHeight="100px"
      onChange={(html) => {
        htmlRef.current = html;
        autoSave.trigger(html);
      }}
      companyId={companyId}
      disableMedia
    />
  );
}
