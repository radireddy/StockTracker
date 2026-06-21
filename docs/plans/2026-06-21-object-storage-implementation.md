# Object Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add file upload support (images/PDFs) to the Tiptap rich text editor with an extensible storage provider layer backed by Supabase Storage.

**Architecture:** Strategy pattern with a `StorageProvider` interface, provider registry (mirrors `src/lib/providers/stock-price/`), and Supabase Storage as the default implementation. Uploads go through a `POST /api/upload` route. The Tiptap editor gets image upload (toolbar + drag/drop/paste) and PDF upload (toolbar) buttons.

**Tech Stack:** Next.js 15 API Routes, Supabase Storage SDK, Tiptap extensions, TypeScript

**Design doc:** `docs/plans/2026-06-21-object-storage-design.md`

---

### Task 1: Storage Provider Interface & Types

**Files:**
- Create: `src/lib/providers/storage/types.ts`

**Step 1: Create the storage provider interface**

```typescript
// src/lib/providers/storage/types.ts

export interface StorageResult {
  path: string;
  url: string;
  size: number;
}

export interface StorageProvider {
  name: string;
  upload(file: Buffer, path: string, contentType: string): Promise<StorageResult>;
  delete(path: string): Promise<void>;
  getPublicUrl(path: string): string;
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
] as const;

export const ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
] as const;

export type AllowedMimeType = (typeof ALLOWED_TYPES)[number];

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

export function getMaxSize(contentType: string): number {
  if (ALLOWED_IMAGE_TYPES.includes(contentType as any)) return MAX_IMAGE_SIZE;
  if (ALLOWED_DOCUMENT_TYPES.includes(contentType as any)) return MAX_DOCUMENT_SIZE;
  return 0;
}

export function isAllowedType(contentType: string): contentType is AllowedMimeType {
  return ALLOWED_TYPES.includes(contentType as any);
}

export function isImageType(contentType: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(contentType as any);
}
```

**Step 2: Commit**

```bash
git add src/lib/providers/storage/types.ts
git commit -m "feat: add storage provider interface and types"
```

---

### Task 2: Supabase Storage Provider Implementation

**Files:**
- Create: `src/lib/providers/storage/supabase-storage.ts`

**Step 1: Implement the Supabase storage provider**

```typescript
// src/lib/providers/storage/supabase-storage.ts

import { createClient } from "@/lib/supabase/server";
import type { StorageProvider, StorageResult } from "./types";

const BUCKET = "attachments";

export class SupabaseStorageProvider implements StorageProvider {
  name = "supabase";

  async upload(file: Buffer, path: string, contentType: string): Promise<StorageResult> {
    const supabase = await createClient();

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    const url = this.getPublicUrl(path);
    return { path, url, size: file.byteLength };
  }

  async delete(path: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([path]);

    if (error) {
      throw new Error(`Storage delete failed: ${error.message}`);
    }
  }

  getPublicUrl(path: string): string {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/providers/storage/supabase-storage.ts
git commit -m "feat: add Supabase storage provider implementation"
```

---

### Task 3: Storage Provider Registry

**Files:**
- Create: `src/lib/providers/storage/registry.ts`

**Step 1: Create the registry (mirrors `src/lib/providers/stock-price/registry.ts`)**

```typescript
// src/lib/providers/storage/registry.ts

import type { StorageProvider } from "./types";
import { SupabaseStorageProvider } from "./supabase-storage";

class StorageProviderRegistry {
  private providers = new Map<string, StorageProvider>();
  private activeProvider: string = "supabase";

  constructor() {
    this.register(new SupabaseStorageProvider());
  }

  register(provider: StorageProvider) {
    this.providers.set(provider.name, provider);
  }

  setActive(name: string) {
    if (!this.providers.has(name)) {
      throw new Error(`Storage provider "${name}" not registered`);
    }
    this.activeProvider = name;
  }

  getActive(): StorageProvider {
    return this.providers.get(this.activeProvider)!;
  }

  getProvider(name: string): StorageProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const storageRegistry = new StorageProviderRegistry();
```

**Step 2: Commit**

```bash
git add src/lib/providers/storage/registry.ts
git commit -m "feat: add storage provider registry"
```

---

### Task 4: Upload API Route

**Files:**
- Create: `src/app/api/upload/route.ts`

**Step 1: Implement the upload endpoint**

```typescript
// src/app/api/upload/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storageRegistry } from "@/lib/providers/storage/registry";
import { isAllowedType, getMaxSize } from "@/lib/providers/storage/types";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!companyId) {
    return NextResponse.json({ error: "No companyId provided" }, { status: 400 });
  }

  // 3. Validate file type
  const contentType = file.type;
  if (!isAllowedType(contentType)) {
    return NextResponse.json(
      { error: `File type "${contentType}" not allowed. Allowed: JPEG, PNG, WebP, GIF, PDF` },
      { status: 400 }
    );
  }

  // 4. Validate file size
  const maxSize = getMaxSize(contentType);
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return NextResponse.json(
      { error: `File too large. Maximum size: ${maxMB}MB` },
      { status: 400 }
    );
  }

  // 5. Generate storage path
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${user.id}/${companyId}/${uuidv4()}-${sanitizedName}`;

  // 6. Upload via provider
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const provider = storageRegistry.getActive();
    const result = await provider.upload(buffer, path, contentType);

    return NextResponse.json({
      url: result.url,
      path: result.path,
      filename: file.name,
      contentType,
      size: result.size,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    return NextResponse.json(
      { error: "Upload failed. Please try again." },
      { status: 500 }
    );
  }
}
```

**Step 2: Check if `uuid` is already a dependency**

Run: `grep uuid package.json`

If not present, install it:
```bash
npm install uuid && npm install -D @types/uuid
```

**Step 3: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat: add file upload API route"
```

---

### Task 5: Supabase Storage Migration

**Files:**
- Create: `supabase/migrations/007_storage_bucket.sql`

**Step 1: Create the migration**

```sql
-- Create the attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('attachments', 'attachments', true, 10485760)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can upload to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Users can read own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Users can delete own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

**Step 2: Commit**

```bash
git add supabase/migrations/007_storage_bucket.sql
git commit -m "feat: add storage bucket migration with RLS policies"
```

---

### Task 6: Update RichTextEditor Props & Dynamic Wrapper

**Files:**
- Modify: `src/components/ui/rich-text-editor-impl.tsx:88-94` (RichTextEditorProps interface)
- Modify: `src/components/ui/rich-text-editor.tsx` (pass-through wrapper)

**Step 1: Add `companyId` and `onUploadStart`/`onUploadEnd` to props**

In `src/components/ui/rich-text-editor-impl.tsx`, update the `RichTextEditorProps` interface at line 88:

```typescript
export interface RichTextEditorProps {
  content?: string;
  placeholder?: string;
  minHeight?: string;
  onChange?: (html: string) => void;
  editorRef?: (editor: Editor | null) => void;
  companyId?: string; // enables file upload when provided
}
```

**Step 2: Commit**

```bash
git add src/components/ui/rich-text-editor-impl.tsx src/components/ui/rich-text-editor.tsx
git commit -m "feat: add companyId prop to RichTextEditor"
```

---

### Task 7: Add Upload Logic to RichTextEditor

**Files:**
- Modify: `src/components/ui/rich-text-editor-impl.tsx`

**Step 1: Add upload helper function and state**

Add these imports at the top of the file (after existing imports at line 86):

```typescript
import { Paperclip, Loader2 } from "lucide-react";
```

Add upload helper and state inside the `RichTextEditorImpl` component (before the `useEditor` call). Also add `companyId` to the destructured props:

```typescript
export default function RichTextEditorImpl({
  content = "",
  placeholder = "Start writing...",
  minHeight = "150px",
  onChange,
  editorRef,
  companyId,
}: RichTextEditorProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

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
  // ... rest of component
```

**Step 2: Update `Toolbar` component to accept upload props**

Change the Toolbar function signature and add the image upload and PDF upload buttons. Replace the existing `addImage` callback (line 298-303) and add PDF handling:

```typescript
function Toolbar({ editor, companyId, uploading, onImageUpload, onPdfUpload, fileInputRef, pdfInputRef }: {
  editor: Editor;
  companyId?: string;
  uploading: boolean;
  onImageUpload: (file: File) => void;
  onPdfUpload: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  pdfInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const iconSize = 15;

  const addImage = useCallback(() => {
    if (companyId) {
      // Use file upload
      fileInputRef.current?.click();
    } else {
      // Fallback to URL prompt
      const url = window.prompt("Image URL:");
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    }
  }, [editor, companyId, fileInputRef]);

  const addPdf = useCallback(() => {
    pdfInputRef.current?.click();
  }, [pdfInputRef]);

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
```

Then in the Toolbar JSX, after the existing ImagePlus button (around line 476-478), add the PDF button:

```tsx
      <ToolbarButton onClick={addImage} title="Insert Image" disabled={uploading}>
        {uploading ? <Loader2 size={iconSize} className="animate-spin" /> : <ImagePlus size={iconSize} />}
      </ToolbarButton>
      {companyId && (
        <ToolbarButton onClick={addPdf} title="Attach PDF" disabled={uploading}>
          <Paperclip size={iconSize} />
        </ToolbarButton>
      )}
```

**Step 3: Add drag-and-drop and paste handlers to the editor**

Inside `RichTextEditorImpl`, update the `useEditor` config to add `editorProps`:

```typescript
  const handleFileDrop = useCallback(async (file: File, editor: Editor) => {
    if (!companyId) return false;

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) return false;

    setUploading(true);
    const result = await uploadFile(file);
    setUploading(false);

    if (!result) return false;

    if (isImage) {
      editor.chain().focus().setImage({ src: result.url }).run();
    } else {
      const sizeKB = Math.round(result.size / 1024);
      const sizeLabel = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
      editor.chain().focus()
        .insertContent(`<a href="${result.url}" target="_blank" rel="noopener">📄 ${result.filename} (${sizeLabel})</a>`)
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
      Link.configure({ openOnClick: false, autolink: true }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content,
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files.length) return false;
        const file = event.dataTransfer.files[0];
        handleFileDrop(file, editor!);
        return true;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.kind === "file") {
            const file = item.getAsFile();
            if (file) {
              handleFileDrop(file, editor!);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    onCreate: ({ editor: e }) => {
      editorRef?.(e);
    },
    onDestroy: () => {
      editorRef?.(null);
    },
  });
```

**Step 4: Add hidden file inputs and update Toolbar call in JSX**

In the return statement of `RichTextEditorImpl`, add hidden inputs and update the Toolbar:

```tsx
  return (
    <div className="tiptap-editor rounded-lg border border-border/60 bg-background overflow-hidden focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/20 transition-all">
      <Toolbar
        editor={editor}
        companyId={companyId}
        uploading={uploading}
        onImageUpload={(file) => handleFileDrop(file, editor)}
        onPdfUpload={(file) => handleFileDrop(file, editor)}
        fileInputRef={fileInputRef}
        pdfInputRef={pdfInputRef}
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
            await handleFileDrop(file, editor);
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
            await handleFileDrop(file, editor);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
```

**Step 5: Commit**

```bash
git add src/components/ui/rich-text-editor-impl.tsx
git commit -m "feat: add file upload support to RichTextEditor (image + PDF)"
```

---

### Task 8: Pass companyId to Editors in Consumer Components

**Files:**
- Modify: `src/components/company/timeline-tab.tsx:107-111,130-135` (RichTextEditor usages)
- Modify: `src/components/company/thesis-tab.tsx:21-25` (RichTextEditor usage)
- Modify: `src/components/company/highlights-section.tsx:21-25` (RichTextEditor usage)

**Step 1: Update TimelineTab**

In `src/components/company/timeline-tab.tsx`, add `companyId` to both RichTextEditor instances:

Line ~107 (add entry editor):
```tsx
        <RichTextEditor
          placeholder="Add an update, note, or summary..."
          minHeight="80px"
          onChange={(html) => { htmlRef.current = html; }}
          editorRef={setEditor}
          companyId={companyId}
        />
```

Line ~130 (edit entry editor):
```tsx
                <RichTextEditor
                  placeholder="Edit entry..."
                  minHeight="80px"
                  content={entry.content}
                  onChange={(html) => { editHtmlRef.current = html; }}
                  editorRef={setEditEditor}
                  companyId={companyId}
                />
```

**Step 2: Update ThesisTab**

In `src/components/company/thesis-tab.tsx`, add `companyId` prop to component and editor.

Update component signature:
```tsx
export function ThesisTab({ company }: { company: Company }) {
```

Update RichTextEditor usage (line ~21):
```tsx
      <RichTextEditor
        content={company.thesis ?? ""}
        placeholder="Write your investment thesis..."
        minHeight="200px"
        onChange={(html) => { htmlRef.current = html; }}
        companyId={company.id}
      />
```

**Step 3: Update HighlightsSection**

In `src/components/company/highlights-section.tsx`, same pattern as ThesisTab.

Update RichTextEditor usage (line ~21):
```tsx
      <RichTextEditor
        content={company.highlights ?? ""}
        placeholder="Key highlights..."
        minHeight="100px"
        onChange={(html) => { htmlRef.current = html; }}
        companyId={company.id}
      />
```

**Step 4: Commit**

```bash
git add src/components/company/timeline-tab.tsx src/components/company/thesis-tab.tsx src/components/company/highlights-section.tsx
git commit -m "feat: enable file uploads in timeline, thesis, and highlights editors"
```

---

### Task 9: Run the Supabase Migration

**Step 1: Apply migration to remote Supabase project**

Run: `npx supabase db push`

Or if using local dev: `npx supabase migration up`

If `supabase` CLI is not available, apply the SQL manually via the Supabase Dashboard SQL Editor.

**Step 2: Verify bucket was created**

Check in Supabase Dashboard → Storage → Buckets that `attachments` bucket exists and is public.

---

### Task 10: Manual Testing & Verification

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test image upload in timeline**

1. Navigate to a company → Timeline tab
2. Click the image icon (ImagePlus) in the editor toolbar
3. Select a JPEG/PNG < 5MB
4. Verify: image appears inline in the editor
5. Save the entry → verify image renders in the saved entry

**Step 3: Test PDF upload in timeline**

1. Click the paperclip icon in the editor toolbar
2. Select a PDF < 10MB
3. Verify: a styled link like `📄 filename.pdf (2.3 MB)` appears in the editor
4. Save and click the link → verify PDF opens in new tab

**Step 4: Test drag-and-drop**

1. Drag an image file from Finder into the editor
2. Verify: image uploads and appears inline

**Step 5: Test paste**

1. Copy an image (e.g., screenshot)
2. Paste into the editor
3. Verify: image uploads and appears inline

**Step 6: Test validation**

1. Try uploading a `.txt` file → verify error message
2. Try uploading an image > 5MB → verify error message

**Step 7: Test thesis and highlights**

1. Navigate to Thesis tab → upload an image → save
2. Navigate to Highlights → upload an image → save

**Step 8: Final commit**

```bash
git add -A
git commit -m "feat: object storage integration with Supabase Storage

- Extensible storage provider interface (strategy pattern)
- Supabase Storage provider with public bucket + RLS
- Upload API route with auth, type/size validation
- Tiptap editor: image upload (toolbar + drag/drop/paste), PDF upload (toolbar)
- Enabled in timeline, thesis, and highlights editors"
```

---

## Summary of Files

| Action | File |
|--------|------|
| Create | `src/lib/providers/storage/types.ts` |
| Create | `src/lib/providers/storage/supabase-storage.ts` |
| Create | `src/lib/providers/storage/registry.ts` |
| Create | `src/app/api/upload/route.ts` |
| Create | `supabase/migrations/007_storage_bucket.sql` |
| Modify | `src/components/ui/rich-text-editor-impl.tsx` |
| Modify | `src/components/ui/rich-text-editor.tsx` (no changes needed — pass-through) |
| Modify | `src/components/company/timeline-tab.tsx` |
| Modify | `src/components/company/thesis-tab.tsx` |
| Modify | `src/components/company/highlights-section.tsx` |
