import { describe, it, expect } from "vitest";
import { clientIdFromFileName } from "@/lib/import/tradebook-filename";

describe("clientIdFromFileName", () => {
  it("extracts the client id from a Zerodha CSV filename", () => {
    expect(clientIdFromFileName("tradebook-YY7859-EQ.csv")).toBe("YY7859");
  });

  it("extracts it from an XLSX filename with a duplicate suffix", () => {
    expect(clientIdFromFileName("tradebook-XD6134-EQ (1).xlsx")).toBe("XD6134");
  });

  it("uppercases a lowercase client id", () => {
    expect(clientIdFromFileName("tradebook-ab6243-eq.csv")).toBe("AB6243");
  });

  it("returns null when the filename does not match the pattern", () => {
    expect(clientIdFromFileName("my-random-export.csv")).toBeNull();
  });
});
