import { describe, it, expect } from "vitest";
import { sanitizePostgrestSearch } from "@/lib/postgrest-filter";

describe("sanitizePostgrestSearch", () => {
  it("leaves ordinary alphanumeric search terms untouched", () => {
    expect(sanitizePostgrestSearch("Reliance")).toBe("Reliance");
    expect(sanitizePostgrestSearch("TCS 500")).toBe("TCS 500");
  });

  it("preserves characters that are safe inside a PostgREST value", () => {
    // Dots, ampersands, hyphens and apostrophes appear in real names
    // (e.g. "M.R.F.", "Larsen & Toubro") and are not filter metacharacters.
    expect(sanitizePostgrestSearch("M.R.F.")).toBe("M.R.F.");
    expect(sanitizePostgrestSearch("Larsen & Toubro")).toBe("Larsen & Toubro");
  });

  it("strips commas so extra .or() conditions cannot be injected", () => {
    expect(sanitizePostgrestSearch("foo,isin.eq.INE123")).toBe(
      "fooisin.eq.INE123"
    );
  });

  it("strips parentheses that could regroup the filter logic", () => {
    expect(sanitizePostgrestSearch("a),name.ilike.(b")).toBe("aname.ilike.b");
  });

  it("strips LIKE wildcards to prevent wildcard injection", () => {
    expect(sanitizePostgrestSearch("%_*")).toBe("");
    expect(sanitizePostgrestSearch("re%li_ance")).toBe("reliance");
  });

  it("strips double quotes and backslashes", () => {
    expect(sanitizePostgrestSearch('a"\\b')).toBe("ab");
  });

  it("trims surrounding whitespace left after stripping", () => {
    expect(sanitizePostgrestSearch("  ( foo )  ")).toBe("foo");
  });
});
