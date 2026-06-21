"use client";

import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./rich-text-editor-impl";

const RichTextEditorImpl = dynamic(
  () => import("./rich-text-editor-impl"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-border/60 bg-background animate-pulse">
        <div className="h-9 border-b border-border/50 bg-muted/30" />
        <div className="px-3 py-2" style={{ minHeight: "150px" }}>
          <div className="h-3 w-48 bg-muted/40 rounded mt-2" />
        </div>
      </div>
    ),
  }
);

export { type RichTextEditorProps };

export function RichTextEditor(props: RichTextEditorProps) {
  return <RichTextEditorImpl {...props} />;
}
