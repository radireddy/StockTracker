import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase storage provider to avoid importing supabase
vi.mock("@/lib/providers/storage/supabase-storage", () => ({
  SupabaseStorageProvider: class {
    name = "supabase";
    async upload() { return { path: "test", url: "test", size: 0 }; }
    async delete() {}
    getPublicUrl(path: string) { return `https://test.supabase.co/storage/v1/object/public/attachments/${path}`; }
  },
}));

describe("StorageProviderRegistry", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("has supabase provider registered", async () => {
    const { storageRegistry } = await import("@/lib/providers/storage/registry");
    const providers = storageRegistry.listProviders();
    expect(providers).toContain("supabase");
  });

  it("defaults to supabase as active provider", async () => {
    const { storageRegistry } = await import("@/lib/providers/storage/registry");
    const active = storageRegistry.getActive();
    expect(active.name).toBe("supabase");
  });

  it("can register and set active provider", async () => {
    const { storageRegistry } = await import("@/lib/providers/storage/registry");
    const mockProvider = {
      name: "local",
      upload: vi.fn(),
      delete: vi.fn(),
      getPublicUrl: vi.fn(),
    };
    storageRegistry.register(mockProvider as any);
    storageRegistry.setActive("local");
    expect(storageRegistry.getActive().name).toBe("local");
    // Reset
    storageRegistry.setActive("supabase");
  });

  it("throws when setting unknown provider as active", async () => {
    const { storageRegistry } = await import("@/lib/providers/storage/registry");
    expect(() => storageRegistry.setActive("unknown")).toThrow('Storage provider "unknown" not registered');
  });

  it("getProvider returns provider by name", async () => {
    const { storageRegistry } = await import("@/lib/providers/storage/registry");
    expect(storageRegistry.getProvider("supabase")).toBeDefined();
  });

  it("getProvider returns undefined for unknown name", async () => {
    const { storageRegistry } = await import("@/lib/providers/storage/registry");
    expect(storageRegistry.getProvider("nonexistent")).toBeUndefined();
  });
});
