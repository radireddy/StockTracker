"use client";

import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./rich-text-editor-impl";

const RichTextEditorImpl = dynamic(
  () => import("./rich-text-editor-impl"),
  {
    ssr: false,
    loading: () => (
      <div className="animate-pulse overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="h-10 border-b border-border/60 bg-muted/30" />
        <div className="px-3.5 py-2.5" style={{ minHeight: "150px" }}>
          <div className="mt-2 h-3 w-48 rounded bg-muted/40" />
        </div>
      </div>
    ),
  }
);

export { type RichTextEditorProps };

export function RichTextEditor(props: RichTextEditorProps) {
  return <RichTextEditorImpl {...props} />;
}
