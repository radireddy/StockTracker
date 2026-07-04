import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = { id: "user-1" };
const COMPANY_ID = "550e8400-e29b-41d4-a716-446655440000";

// Configurable result for the `companies` ownership lookup (.maybeSingle()).
let companyLookup: { data?: unknown; error?: unknown };

function makeClient() {
  return {
    from(_table: string) {
      const b: Record<string, unknown> = {
        select() { return b; },
        eq() { return b; },
        maybeSingle() { return Promise.resolve(companyLookup); },
      };
      return b;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getAuthUserOrNull: async () => ({ supabase: makeClient(), user: USER }),
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ success: true, reset: 0 }),
  RATE_LIMITS: { upload: {} },
}));
// Not reached on the 404/500 paths, but stubbed so the module graph resolves.
vi.mock("@/lib/providers/storage/types", () => ({
  isAllowedType: () => true,
  getMaxSize: () => 10 * 1024 * 1024,
}));
vi.mock("@/lib/providers/storage/registry", () => ({
  storageRegistry: { getActive: () => ({ upload: vi.fn() }) },
}));

import { POST } from "@/app/api/upload/route";

function mkRequest(fields: Record<string, unknown>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.set(k, v as string | Blob);
  }
  return { formData: async () => fd } as unknown as Parameters<typeof POST>[0];
}

function mkFile() {
  return new File([new Uint8Array([1, 2, 3])], "chart.png", { type: "image/png" });
}

beforeEach(() => {
  companyLookup = { data: { id: COMPANY_ID }, error: null };
});

describe("POST /api/upload — company ownership validation", () => {
  it("returns 404 when the company does not belong to the user", async () => {
    companyLookup = { data: null, error: null };

    const res = await POST(mkRequest({ file: mkFile(), companyId: COMPANY_ID }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Company not found" });
  });

  it("returns 500 when the company lookup errors", async () => {
    companyLookup = { data: null, error: { message: "db exploded" } };

    const res = await POST(mkRequest({ file: mkFile(), companyId: COMPANY_ID }));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Upload failed. Please try again." });
  });
});
