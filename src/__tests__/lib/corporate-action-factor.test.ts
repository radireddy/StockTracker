import { describe, it, expect } from "vitest";
import { parseCorporateAction } from "@/lib/import/corporate-action-factor";

describe("parseCorporateAction", () => {
  it("parses a face-value split into a share multiplier", () => {
    expect(parseCorporateAction("Face Value Split (Sub-Division) - From Rs 2/- Per Share To Re 1/- Per Share"))
      .toEqual({ action_type: "split", factor: 2 });
    expect(parseCorporateAction("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share"))
      .toEqual({ action_type: "split", factor: 5 });
  });

  it("parses an equity bonus a:b into (a+b)/b", () => {
    expect(parseCorporateAction("Bonus 1:1")).toEqual({ action_type: "bonus", factor: 2 });
    expect(parseCorporateAction("Bonus 2:1")).toEqual({ action_type: "bonus", factor: 3 });
    expect(parseCorporateAction("Bonus 1:2")).toEqual({ action_type: "bonus", factor: 1.5 });
  });

  it("rejects non-equity bonuses (NCRPS / scheme of arrangement)", () => {
    expect(parseCorporateAction("Scheme Of Arrangement - Bonus Ncrps 4:1")).toBeNull();
    expect(parseCorporateAction("Bonus Preference 1:1")).toBeNull();
  });

  it("returns null for dividends, rights, buybacks", () => {
    expect(parseCorporateAction("Interim Dividend - Re 0.50 Per Share")).toBeNull();
    expect(parseCorporateAction("Rights 1:5")).toBeNull();
    expect(parseCorporateAction("Buy Back of Shares")).toBeNull();
  });
});
