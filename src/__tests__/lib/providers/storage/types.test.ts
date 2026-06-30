import { describe, it, expect } from "vitest";
import {
  getMaxSize,
  isAllowedType,
  isImageType,
  ALLOWED_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  MAX_IMAGE_SIZE,
  MAX_DOCUMENT_SIZE,
} from "@/lib/providers/storage/types";

describe("storage type constants", () => {
  it("MAX_IMAGE_SIZE is 5MB", () => {
    expect(MAX_IMAGE_SIZE).toBe(5 * 1024 * 1024);
  });

  it("MAX_DOCUMENT_SIZE is 10MB", () => {
    expect(MAX_DOCUMENT_SIZE).toBe(10 * 1024 * 1024);
  });

  it("ALLOWED_IMAGE_TYPES contains expected types", () => {
    expect(ALLOWED_IMAGE_TYPES).toContain("image/jpeg");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/png");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/webp");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/gif");
  });

  it("ALLOWED_DOCUMENT_TYPES contains PDF", () => {
    expect(ALLOWED_DOCUMENT_TYPES).toContain("application/pdf");
  });

  it("ALLOWED_TYPES is union of images and documents", () => {
    expect(ALLOWED_TYPES.length).toBe(ALLOWED_IMAGE_TYPES.length + ALLOWED_DOCUMENT_TYPES.length);
  });
});

describe("getMaxSize", () => {
  it("returns image size for image types", () => {
    expect(getMaxSize("image/jpeg")).toBe(MAX_IMAGE_SIZE);
    expect(getMaxSize("image/png")).toBe(MAX_IMAGE_SIZE);
    expect(getMaxSize("image/webp")).toBe(MAX_IMAGE_SIZE);
    expect(getMaxSize("image/gif")).toBe(MAX_IMAGE_SIZE);
  });

  it("returns document size for PDF", () => {
    expect(getMaxSize("application/pdf")).toBe(MAX_DOCUMENT_SIZE);
  });

  it("returns 0 for unknown types", () => {
    expect(getMaxSize("text/plain")).toBe(0);
    expect(getMaxSize("application/json")).toBe(0);
  });
});

describe("isAllowedType", () => {
  it("returns true for allowed types", () => {
    expect(isAllowedType("image/jpeg")).toBe(true);
    expect(isAllowedType("image/png")).toBe(true);
    expect(isAllowedType("application/pdf")).toBe(true);
  });

  it("returns false for disallowed types", () => {
    expect(isAllowedType("text/plain")).toBe(false);
    expect(isAllowedType("application/json")).toBe(false);
    expect(isAllowedType("video/mp4")).toBe(false);
  });
});

describe("isImageType", () => {
  it("returns true for image types", () => {
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("image/webp")).toBe(true);
    expect(isImageType("image/gif")).toBe(true);
  });

  it("returns false for non-image types", () => {
    expect(isImageType("application/pdf")).toBe(false);
    expect(isImageType("text/plain")).toBe(false);
  });
});
