import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";

function parse(csp: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const directive of csp.split(";")) {
    const trimmed = directive.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    out[name] = values.join(" ");
  }
  return out;
}

describe("buildContentSecurityPolicy", () => {
  const nonce = "test-nonce-abc123";
  const supabaseUrl = "https://proj.supabase.co";

  describe("production policy", () => {
    const csp = buildContentSecurityPolicy({ nonce, isDev: false, supabaseUrl });
    const d = parse(csp);

    it("locks down default-src to self", () => {
      expect(d["default-src"]).toBe("'self'");
    });

    it("uses the nonce and strict-dynamic for scripts, never unsafe-inline/eval", () => {
      expect(d["script-src"]).toContain(`'nonce-${nonce}'`);
      expect(d["script-src"]).toContain("'strict-dynamic'");
      expect(d["script-src"]).not.toContain("'unsafe-inline'");
      expect(d["script-src"]).not.toContain("'unsafe-eval'");
    });

    it("blocks object embedding and framing", () => {
      expect(d["object-src"]).toBe("'none'");
      expect(d["frame-ancestors"]).toBe("'none'");
    });

    it("pins base-uri and form-action to self", () => {
      expect(d["base-uri"]).toBe("'self'");
      expect(d["form-action"]).toBe("'self'");
    });

    it("allows Supabase over https and wss for realtime", () => {
      expect(d["connect-src"]).toContain(supabaseUrl);
      expect(d["connect-src"]).toContain("wss://proj.supabase.co");
      expect(d["connect-src"]).toContain("'self'");
    });

    it("allows images from self, data/blob URIs, and any https host (user-pasted rich text)", () => {
      expect(d["img-src"]).toContain("'self'");
      expect(d["img-src"]).toContain("data:");
      expect(d["img-src"]).toContain("blob:");
      expect(d["img-src"]).toContain("https:");
    });

    it("keeps styles inline (framework/font injected) but restricted to self otherwise", () => {
      expect(d["style-src"]).toContain("'self'");
      expect(d["style-src"]).toContain("'unsafe-inline'");
    });

    it("upgrades insecure requests in production", () => {
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it("does not allow plain ws: (dev HMR only)", () => {
      expect(d["connect-src"]).not.toContain("ws:");
    });
  });

  describe("development policy", () => {
    const csp = buildContentSecurityPolicy({ nonce, isDev: true, supabaseUrl });
    const d = parse(csp);

    it("permits unsafe-eval and unsafe-inline for Fast Refresh / HMR", () => {
      expect(d["script-src"]).toContain("'unsafe-eval'");
      expect(d["script-src"]).toContain("'unsafe-inline'");
    });

    it("does not use strict-dynamic in dev", () => {
      expect(d["script-src"]).not.toContain("'strict-dynamic'");
    });

    it("allows websocket HMR connections", () => {
      expect(d["connect-src"]).toContain("ws:");
      expect(d["connect-src"]).toContain("wss:");
    });

    it("does not force upgrade-insecure-requests on localhost", () => {
      expect(csp).not.toContain("upgrade-insecure-requests");
    });
  });

  describe("missing supabase url", () => {
    it("still produces a valid policy without empty tokens", () => {
      const csp = buildContentSecurityPolicy({ nonce, isDev: false, supabaseUrl: "" });
      const d = parse(csp);
      expect(d["connect-src"]).toBe("'self'");
      // no dangling double spaces or empty scheme tokens
      expect(csp).not.toContain("  ");
      expect(d["connect-src"]).not.toContain("wss://");
    });

    it("treats a non-https supabase url defensively (no wss derivation)", () => {
      const csp = buildContentSecurityPolicy({
        nonce,
        isDev: false,
        supabaseUrl: "http://localhost:54321",
      });
      const d = parse(csp);
      expect(d["connect-src"]).toContain("http://localhost:54321");
    });
  });
});

describe("generateNonce", () => {
  it("returns a non-empty base64 string", () => {
    const nonce = generateNonce();
    expect(nonce).toBeTruthy();
    expect(typeof nonce).toBe("string");
    // base64 characters only
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
  });

  it("returns a different value on each call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
