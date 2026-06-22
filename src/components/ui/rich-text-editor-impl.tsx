"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import ImageResize from "tiptap-extension-resize-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Extension } from "@tiptap/core";
import { cn } from "@/lib/utils";

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code2,
  Undo2,
  Redo2,
  Minus,
  Link as LinkIcon,
  Unlink,
  ImagePlus,
  Paperclip,
  Loader2,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Palette,
  Trash2,
  Plus,
  ArrowDown,
  ArrowRight,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface RichTextEditorProps {
  content?: string;
  placeholder?: string;
  minHeight?: string;
  onChange?: (html: string) => void;
  editorRef?: (editor: Editor | null) => void;
  companyId?: string;
  disableMedia?: boolean;
}

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];

function FontSizeSelect({ editor }: { editor: Editor }) {
  const currentSize = editor.getAttributes("textStyle").fontSize || "";

  return (
    <select
      value={currentSize}
      onChange={(e) => {
        const size = e.target.value;
        if (size) {
          (editor.chain().focus() as any).setFontSize(size).run();
        } else {
          (editor.chain().focus() as any).unsetFontSize().run();
        }
      }}
      title="Font Size"
      className="h-7 px-1 text-xs rounded-md border border-border/50 bg-background text-foreground hover:bg-muted transition-colors cursor-pointer outline-none focus:ring-1 focus:ring-ring"
    >
      <option value="">Size</option>
      {FONT_SIZES.map((size) => (
        <option key={size} value={size}>
          {parseInt(size)}
        </option>
      ))}
    </select>
  );
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded-md transition-colors",
        active
          ? "bg-foreground/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

const COLORS = [
  // Row 1: Dark shades
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#ffffff",
  // Row 2: Vivid
  "#e03131", "#f08c00", "#fcc419", "#2f9e44", "#1971c2", "#7048e8", "#e64980", "#0c8599",
  // Row 3: Medium
  "#ff6b6b", "#ff922b", "#ffd43b", "#51cf66", "#339af0", "#845ef7", "#f06595", "#22b8cf",
  // Row 4: Light/Pastel
  "#ffc9c9", "#ffd8a8", "#ffec99", "#b2f2bb", "#a5d8ff", "#d0bfff", "#fcc2d7", "#99e9f2",
];

function ColorPicker({
  onSelect,
  currentColor,
}: {
  onSelect: (color: string) => void;
  currentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton
        onClick={() => setOpen(!open)}
        active={!!currentColor}
        title="Text Color"
      >
        <Palette size={15} />
      </ToolbarButton>
      {open && (
        <div className="absolute top-full left-0 mt-1 p-1.5 bg-popover border border-border rounded-lg shadow-md z-50 grid grid-cols-8 gap-1">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                "w-5 h-5 rounded-sm border transition-transform hover:scale-125",
                color === "#ffffff" ? "border-border" : "border-border/50",
                currentColor === color && "ring-2 ring-ring ring-offset-1"
              )}
              style={{ backgroundColor: color }}
              onClick={() => {
                onSelect(color);
                setOpen(false);
              }}
            />
          ))}
          <button
            type="button"
            className="col-span-8 h-5 rounded-sm border border-border/50 flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground text-xs"
            title="Remove color"
            onClick={() => {
              onSelect("");
              setOpen(false);
            }}
          >
            <Trash2 size={10} />
            <span>Clear</span>
          </button>
        </div>
      )}
    </div>
  );
}

function TableMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <ToolbarButton
        onClick={() => setOpen((prev) => !prev)}
        active={editor.isActive("table")}
        title="Table"
      >
        <TableIcon size={15} />
      </ToolbarButton>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-md z-50 py-1 min-w-[170px]"
          onMouseDown={(e) => e.preventDefault()}
        >
          {!editor.isActive("table") && (
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors"
              onClick={() => {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                setOpen(false);
              }}
            >
              <Plus size={13} />
              Insert Table
            </button>
          )}
          {editor.isActive("table") && [
            { label: "Add Column After", icon: <ArrowRight size={13} />, action: () => editor.chain().focus().addColumnAfter().run() },
            { label: "Add Row After", icon: <ArrowDown size={13} />, action: () => editor.chain().focus().addRowAfter().run() },
            { label: "Delete Column", icon: <Trash2 size={13} />, action: () => editor.chain().focus().deleteColumn().run() },
            { label: "Delete Row", icon: <Trash2 size={13} />, action: () => editor.chain().focus().deleteRow().run() },
            { label: "Delete Table", icon: <Trash2 size={13} />, action: () => editor.chain().focus().deleteTable().run() },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors"
              onClick={() => {
                item.action();
                setOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toolbar({ editor, companyId, uploading, fileInputRef, pdfInputRef, disableMedia }: {
  editor: Editor;
  companyId?: string;
  uploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pdfInputRef: React.RefObject<HTMLInputElement | null>;
  disableMedia?: boolean;
}) {
  const iconSize = 15;

  const addImage = useCallback(() => {
    if (companyId) {
      fileInputRef.current?.click();
    } else {
      const url = window.prompt("Image URL:");
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    }
  }, [editor, companyId, fileInputRef]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Link URL:", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/50 flex-wrap">
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive("highlight")}
        title="Highlight"
      >
        <Highlighter size={iconSize} />
      </ToolbarButton>
      <ColorPicker
        onSelect={(color) => {
          if (color) {
            editor.chain().focus().setColor(color).run();
          } else {
            editor.chain().focus().unsetColor().run();
          }
        }}
        currentColor={editor.getAttributes("textStyle").color}
      />
      <FontSizeSelect editor={editor} />

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Align Left"
      >
        <AlignLeft size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Align Center"
      >
        <AlignCenter size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Align Right"
      >
        <AlignRight size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered List"
      >
        <ListOrdered size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
        title="Task List"
      >
        <ListChecks size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Blockquote"
      >
        <Quote size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code Block"
      >
        <Code2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus size={iconSize} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Link & Image */}
      <ToolbarButton
        onClick={setLink}
        active={editor.isActive("link")}
        title="Add Link"
      >
        <LinkIcon size={iconSize} />
      </ToolbarButton>
      {editor.isActive("link") && (
        <ToolbarButton
          onClick={() => editor.chain().focus().unsetLink().run()}
          title="Remove Link"
        >
          <Unlink size={iconSize} />
        </ToolbarButton>
      )}
      {!disableMedia && (
        <>
          <ToolbarButton onClick={addImage} title="Insert Image" disabled={uploading}>
            {uploading ? <Loader2 size={iconSize} className="animate-spin" /> : <ImagePlus size={iconSize} />}
          </ToolbarButton>
          {companyId && (
            <ToolbarButton onClick={() => pdfInputRef.current?.click()} title="Attach PDF" disabled={uploading}>
              <Paperclip size={iconSize} />
            </ToolbarButton>
          )}
        </>
      )}

      {/* Table */}
      <TableMenu editor={editor} />

      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={iconSize} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={iconSize} />
      </ToolbarButton>
    </div>
  );
}

export default function RichTextEditorImpl({
  content = "",
  placeholder = "Start writing...",
  minHeight = "150px",
  onChange,
  editorRef,
  companyId,
  disableMedia,
}: RichTextEditorProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const editorInstanceRef = useRef<Editor | null>(null);

  const uploadFile = useCallback(async (file: File): Promise<{ url: string; filename: string; contentType: string; size: number } | null> => {
    if (!companyId) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", companyId);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Upload failed");
      return null;
    }
    return res.json();
  }, [companyId]);

  const handleFileUpload = useCallback(async (file: File, editorInstance: Editor) => {
    if (!companyId) return false;
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) return false;
    setUploading(true);
    const result = await uploadFile(file);
    setUploading(false);
    if (!result) return false;
    if (isImage) {
      editorInstance.chain().focus().setImage({ src: result.url }).run();
    } else {
      const sizeKB = Math.round(result.size / 1024);
      const sizeLabel = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      editorInstance.chain().focus()
        .insertContent(`<a href="${result.url}" target="_blank" rel="noopener noreferrer">📄 ${result.filename} (${sizeLabel})</a>`)
        .run();
    }
    return true;
  }, [companyId, uploadFile]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Underline,
      TextStyle,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
      ...disableMedia ? [] : [ImageResize],
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    onCreate: ({ editor: e }) => {
      editorInstanceRef.current = e;
      editorRef?.(e);
    },
    onDestroy: () => {
      editorInstanceRef.current = null;
      editorRef?.(null);
    },
    editorProps: companyId ? {
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        const file = event.dataTransfer.files[0];
        const inst = editorInstanceRef.current;
        if (inst) handleFileUpload(file, inst);
        return true;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            const inst = editorInstanceRef.current;
            if (file && inst) {
              handleFileUpload(file, inst);
              return true;
            }
          }
        }
        return false;
      },
    } : {},
  });

  if (!editor) return null;

  return (
    <div className="tiptap-editor rounded-lg border border-border/60 bg-background overflow-hidden focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/20 transition-all">
      <Toolbar
        editor={editor}
        companyId={companyId}
        uploading={uploading}
        fileInputRef={fileInputRef}
        pdfInputRef={pdfInputRef}
        disableMedia={disableMedia}
      />
      {uploading && (
        <div className="px-3 py-1.5 bg-muted/50 border-b border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Uploading file...
        </div>
      )}
      <div
        className="prose prose-sm max-w-none px-3 py-2 text-foreground prose-headings:text-foreground prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-blockquote:my-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file && editor) {
            await handleFileUpload(file, editor);
          }
          e.target.value = "";
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file && editor) {
            await handleFileUpload(file, editor);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}
