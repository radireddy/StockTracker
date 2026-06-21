# Object Storage Integration Design

**Date:** 2026-06-21
**Status:** Approved

## Overview

Add file upload support (images and PDFs) to the StockTracker app, integrated inline in the Tiptap rich text editor across timeline, thesis, and highlights. Uses an extensible strategy pattern with Supabase Storage as the initial provider.

## Requirements

- Upload images (JPEG/PNG/WebP/GIF, up to 5MB) and PDFs (up to 10MB)
- Files are inserted inline in the Tiptap rich text editor (images as `<img>`, PDFs as styled links)
- Works in timeline entries, thesis tab, and highlights section
- Extensible storage layer via strategy pattern (Supabase first, S3/GCS/R2 later)
- User-scoped file isolation matching existing RLS patterns

## Architecture

### Storage Provider Interface & Registry

```
src/lib/providers/storage/
├── types.ts              # StorageProvider interface + types
├── registry.ts           # Provider registry (mirrors stock-price/registry.ts)
└── supabase-storage.ts   # Supabase Storage implementation
```

**Interface:**
```typescript
interface StorageProvider {
  upload(file: Buffer, path: string, contentType: string): Promise<StorageResult>
  delete(path: string): Promise<void>
  getPublicUrl(path: string): string
}

type StorageResult = { path: string; url: string; size: number }
```

**Bucket path structure:** `{user_id}/{company_id}/{uuid}-{filename}`

**Registry:** Same pattern as `stock-price/registry.ts` — `getProvider(name)` returns the configured provider, defaults to `'supabase'`.

### Upload API Route

**Endpoint:** `POST /api/upload`

**Flow:**
1. Authenticate via Supabase session (reject if not logged in)
2. Parse multipart form data (`file`, `companyId` fields)
3. Validate file type and size (images <= 5MB, PDFs <= 10MB)
4. Generate storage path: `{user_id}/{company_id}/{uuid}-{sanitized_filename}`
5. Delegate to `StorageProvider.upload()`
6. Return `{ url, path, filename, contentType, size }`

**Why API route vs server action?** Server actions don't handle multipart file uploads well with large files. An API route gives streaming support and proper Content-Type handling.

**No database table for attachments.** Files are referenced by URL in the HTML content. The storage bucket is the source of truth.

### Tiptap Editor Integration

**Image uploads:**
- Toolbar button (image icon) opens file picker (accept: `image/*`)
- On select → upload via `POST /api/upload` → insert returned URL as Tiptap Image node
- Loading placeholder while uploading
- Drag-and-drop and paste support via Tiptap's `handleDrop` and `handlePaste`

**PDF uploads:**
- Toolbar button (paperclip icon) opens file picker (accept: `.pdf`)
- On select → upload via `POST /api/upload` → insert styled link: `📄 filename.pdf (2.3 MB)`

**Changes:**
- `src/components/ui/rich-text-editor-impl.tsx` — Add upload buttons, drop/paste handlers, upload progress state
- Editor accepts optional `companyId` prop for upload path
- No changes to content storage (HTML in TEXT column)

### Supabase Storage Setup

**Bucket:** `attachments` (public, 10MB file size limit)

**RLS policies on `storage.objects`:**
```sql
-- Users can upload to their own folder
CREATE POLICY "Users can upload own files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can read own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Users can delete own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
```

**Migration file:** `supabase/migrations/007_storage_bucket.sql`

### File Cleanup Strategy

**Lazy cleanup — no immediate orphan deletion.** When a user removes an image/PDF from rich text, the file remains in storage. Low volume and low cost make this acceptable. A periodic cleanup job can be added later if storage usage becomes a concern.

## File Types & Limits

| Type | Extensions | Max Size |
|------|-----------|----------|
| Image | JPEG, PNG, WebP, GIF | 5 MB |
| Document | PDF | 10 MB |

## Files to Create/Modify

**New files:**
- `src/lib/providers/storage/types.ts`
- `src/lib/providers/storage/registry.ts`
- `src/lib/providers/storage/supabase-storage.ts`
- `src/app/api/upload/route.ts`
- `supabase/migrations/007_storage_bucket.sql`

**Modified files:**
- `src/components/ui/rich-text-editor-impl.tsx` — Upload buttons, drag/drop/paste, progress state
- `src/components/company/timeline-tab.tsx` — Pass companyId to editor
- `src/components/company/thesis-tab.tsx` — Pass companyId to editor
- `src/components/company/highlights-section.tsx` — Pass companyId to editor
