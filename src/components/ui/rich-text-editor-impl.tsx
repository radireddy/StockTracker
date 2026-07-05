"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

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
  ChevronDown,
  Check,
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

const ICON_SIZE = 15;

/** Shared open/close behaviour for every toolbar popover: click-outside + Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}

function PopoverPanel({
  children,
  className,
  preserveSelection,
}: {
  children: React.ReactNode;
  className?: string;
  /** Keep the editor's text selection intact while interacting (menus, not text inputs). */
  preserveSelection?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute left-0 top-full z-50 mt-1.5 rounded-lg border border-border bg-popover p-1.5 shadow-soft",
        className
      )}
      onMouseDown={preserveSelection ? (e) => e.preventDefault() : undefined}
    >
      {children}
    </div>
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
      aria-label={title}
      aria-pressed={active}
      aria-disabled={disabled}
      title={title}
      className={cn(
        "rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-border/60" />;
}

function FontSizePicker({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = usePopover();
  const currentSize: string = editor.getAttributes("textStyle").fontSize || "";
  const label = currentSize ? String(parseInt(currentSize, 10)) : "Size";

  const applySize = (size: string) => {
    if (size) {
      editor.chain().focus().setFontSize(size).run();
    } else {
      editor.chain().focus().unsetFontSize().run();
    }
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Font size"
        title="Font size"
        className={cn(
          "flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          currentSize
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <span className="tabular-nums">{label}</span>
        <ChevronDown size={13} className="opacity-70" />
      </button>
      {open && (
        <PopoverPanel preserveSelection className="w-24 p-1">
          <button
            type="button"
            onClick={() => applySize("")}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted",
              !currentSize ? "font-semibold text-primary" : "text-muted-foreground"
            )}
          >
            <span>Default</span>
            {!currentSize && <Check size={12} />}
          </button>
          {FONT_SIZES.map((size) => {
            const active = currentSize === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => applySize(size)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1 text-xs tabular-nums transition-colors hover:bg-muted",
                  active ? "font-semibold text-primary" : "text-foreground"
                )}
              >
                <span>{parseInt(size, 10)}</span>
                {active && <Check size={12} />}
              </button>
            );
          })}
        </PopoverPanel>
      )}
    </div>
  );
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
  const { open, setOpen, ref } = usePopover();

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={() => setOpen(!open)} active={!!currentColor} title="Text color">
        <Palette size={ICON_SIZE} />
      </ToolbarButton>
      {open && (
        <PopoverPanel preserveSelection className="w-max p-2">
          <p className="mb-1.5 px-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-muted-foreground">
            Text color
          </p>
          <div className="grid grid-cols-8 gap-1">
            {COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Set text color ${color}`}
                aria-pressed={currentColor === color}
                className={cn(
                  "h-5 w-5 rounded-md border transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100",
                  color === "#ffffff" ? "border-border" : "border-border/40",
                  currentColor === color && "ring-2 ring-ring ring-offset-1 ring-offset-popover"
                )}
                style={{ backgroundColor: color }}
                onClick={() => {
                  onSelect(color);
                  setOpen(false);
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Remove color"
            onClick={() => {
              onSelect("");
              setOpen(false);
            }}
          >
            <Trash2 size={11} />
            <span>Clear color</span>
          </button>
        </PopoverPanel>
      )}
    </div>
  );
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^(https?:\/\/|mailto:|\/)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function LinkPopover({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = usePopover();
  const [url, setUrl] = useState("");
  const isActive = editor.isActive("link");

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setUrl(editor.getAttributes("link").href || "");
    setOpen(true);
  };

  const apply = () => {
    const href = normalizeUrl(url);
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={toggle} active={isActive} title="Link">
        <LinkIcon size={ICON_SIZE} />
      </ToolbarButton>
      {open && (
        <PopoverPanel className="w-64 p-2">
          <input
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={apply}
              className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Apply
            </button>
            {isActive && (
              <button
                type="button"
                onClick={remove}
                className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Remove
              </button>
            )}
          </div>
        </PopoverPanel>
      )}
    </div>
  );
}

function ImageUrlPopover({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = usePopover();
  const [url, setUrl] = useState("");

  const apply = () => {
    const src = normalizeUrl(url);
    if (src) editor.chain().focus().setImage({ src }).run();
    setUrl("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={() => setOpen(!open)} title="Insert image">
        <ImagePlus size={ICON_SIZE} />
      </ToolbarButton>
      {open && (
        <PopoverPanel className="w-64 p-2">
          <input
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply();
              }
            }}
            placeholder="https://image-url.png"
            aria-label="Image URL"
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          <button
            type="button"
            onClick={apply}
            className="mt-2 w-full rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Insert image
          </button>
        </PopoverPanel>
      )}
    </div>
  );
}

function TableMenu({ editor }: { editor: Editor }) {
  const { open, setOpen, ref } = usePopover();

  return (
    <div className="relative" ref={ref}>
      <ToolbarButton onClick={() => setOpen(!open)} active={editor.isActive("table")} title="Table">
        <TableIcon size={ICON_SIZE} />
      </ToolbarButton>
      {open && (
        <PopoverPanel preserveSelection className="min-w-[180px] p-1">
          {!editor.isActive("table") && (
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
              onClick={() => {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                setOpen(false);
              }}
            >
              <Plus size={13} />
              Insert table
            </button>
          )}
          {editor.isActive("table") &&
            [
              { label: "Add column after", icon: <ArrowRight size={13} />, action: () => editor.chain().focus().addColumnAfter().run() },
              { label: "Add row after", icon: <ArrowDown size={13} />, action: () => editor.chain().focus().addRowAfter().run() },
              { label: "Delete column", icon: <Trash2 size={13} />, action: () => editor.chain().focus().deleteColumn().run() },
              { label: "Delete row", icon: <Trash2 size={13} />, action: () => editor.chain().focus().deleteRow().run() },
              { label: "Delete table", icon: <Trash2 size={13} />, action: () => editor.chain().focus().deleteTable().run() },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                onClick={() => {
                  item.action();
                  setOpen(false);
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
        </PopoverPanel>
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
  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-border/60 bg-muted/30 px-2 py-1.5"
    >
      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold (Ctrl+B)"
      >
        <Bold size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic (Ctrl+I)"
      >
        <Italic size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive("highlight")}
        title="Highlight"
      >
        <Highlighter size={ICON_SIZE} />
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
      <FontSizePicker editor={editor} />

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={ICON_SIZE} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Align left"
      >
        <AlignLeft size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Align center"
      >
        <AlignCenter size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Align right"
      >
        <AlignRight size={ICON_SIZE} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Ordered list"
      >
        <ListOrdered size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        active={editor.isActive("taskList")}
        title="Task list"
      >
        <ListChecks size={ICON_SIZE} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Blockquote"
      >
        <Quote size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        active={editor.isActive("codeBlock")}
        title="Code block"
      >
        <Code2 size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal rule"
      >
        <Minus size={ICON_SIZE} />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Link & media */}
      <LinkPopover editor={editor} />
      {!disableMedia && (
        <>
          {companyId ? (
            <>
              <ToolbarButton
                onClick={() => fileInputRef.current?.click()}
                title="Insert image"
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 size={ICON_SIZE} className="animate-spin" />
                ) : (
                  <ImagePlus size={ICON_SIZE} />
                )}
              </ToolbarButton>
              <ToolbarButton
                onClick={() => pdfInputRef.current?.click()}
                title="Attach PDF"
                disabled={uploading}
              >
                <Paperclip size={ICON_SIZE} />
              </ToolbarButton>
            </>
          ) : (
            <ImageUrlPopover editor={editor} />
          )}
        </>
      )}
      <TableMenu editor={editor} />

      <ToolbarDivider />

      {/* Undo/Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={ICON_SIZE} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={ICON_SIZE} />
      </ToolbarButton>
    </div>
  );
}

function SelectionBubbleMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lift"
    >
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline"
      >
        <UnderlineIcon size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strikethrough"
      >
        <Strikethrough size={14} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        active={editor.isActive("highlight")}
        title="Highlight"
      >
        <Highlighter size={14} />
      </ToolbarButton>
    </BubbleMenu>
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
    immediatelyRender: false,
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
    <div className="tiptap-editor rounded-xl border bg-card shadow-soft transition-[border-color,box-shadow] focus-within:border-ring/40 focus-within:ring-2 focus-within:ring-ring/25">
      <Toolbar
        editor={editor}
        companyId={companyId}
        uploading={uploading}
        fileInputRef={fileInputRef}
        pdfInputRef={pdfInputRef}
        disableMedia={disableMedia}
      />
      <SelectionBubbleMenu editor={editor} />
      {uploading && (
        <div className="flex items-center gap-2 border-b border-border/50 bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Uploading file...
        </div>
      )}
      <div
        className="prose prose-sm max-w-none px-3.5 py-2.5 text-foreground prose-headings:my-2 prose-headings:text-foreground prose-p:my-1.5 prose-strong:text-foreground prose-a:font-medium prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-blockquote:my-2 prose-blockquote:border-border prose-blockquote:text-muted-foreground prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground prose-ol:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 prose-hr:border-border"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Upload image"
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
        aria-label="Attach PDF"
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
