import { describe, it, expect } from "vitest";
import {
  STATUS_LABEL,
  STATUS_VAR,
  STATUS_TEXT,
  STATUS_STRIPE,
  STATUS_ROW_BG,
} from "@/components/dashboard/status-tag";

describe("STATUS_LABEL", () => {
  it("maps each status to its human label", () => {
    expect(STATUS_LABEL.under).toBe("Under");
    expect(STATUS_LABEL.in_range).toBe("In Range");
    expect(STATUS_LABEL.over).toBe("Over");
  });
});

describe("STATUS_VAR", () => {
  it("maps each status to a CSS variable string", () => {
    expect(STATUS_VAR.under).toBe("var(--warning)");
    expect(STATUS_VAR.in_range).toBe("var(--positive)");
    expect(STATUS_VAR.over).toBe("var(--destructive)");
  });
});

describe("STATUS_TEXT", () => {
  it("maps each status to its text-colour utility class", () => {
    expect(STATUS_TEXT.under).toBe("text-warning");
    expect(STATUS_TEXT.in_range).toBe("text-positive");
    expect(STATUS_TEXT.over).toBe("text-destructive");
  });
});

describe("STATUS_STRIPE", () => {
  it("maps each status to its border-left stripe class", () => {
    expect(STATUS_STRIPE.under).toBe("border-l-warning");
    expect(STATUS_STRIPE.in_range).toBe("border-l-positive");
    expect(STATUS_STRIPE.over).toBe("border-l-destructive");
  });
});

describe("STATUS_ROW_BG", () => {
  it("maps each status to its soft row tint class", () => {
    expect(STATUS_ROW_BG.under).toBe("bg-warning/[0.07]");
    expect(STATUS_ROW_BG.in_range).toBe("bg-positive/[0.07]");
    expect(STATUS_ROW_BG.over).toBe("bg-destructive/[0.07]");
  });
});
