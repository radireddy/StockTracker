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
