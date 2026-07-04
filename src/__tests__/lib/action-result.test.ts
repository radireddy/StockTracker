import { describe, it, expect } from "vitest";
import { action, AppError, describeDbError } from "@/lib/action-result";

describe("AppError", () => {
  it("carries a message and an optional hint", () => {
    const e = new AppError("boom", "do this");
    expect(e.message).toBe("boom");
    expect(e.hint).toBe("do this");
    expect(e.name).toBe("AppError");
    expect(e).toBeInstanceOf(Error);
  });

  it("allows an omitted hint", () => {
    const e = new AppError("boom");
    expect(e.hint).toBeUndefined();
  });
});

describe("describeDbError", () => {
  it("maps unique violations", () => {
    const e = describeDbError({ code: "23505" });
    expect(e.message).toMatch(/already exists/i);
    expect(e.hint).toBeTruthy();
  });

  it("maps foreign-key violations", () => {
    expect(describeDbError({ code: "23503" }).message).toMatch(/related record/i);
  });

  it("maps check violations", () => {
    expect(describeDbError({ code: "23514" }).message).toMatch(/allowed range/i);
  });

  it("maps not-null violations", () => {
    expect(describeDbError({ code: "23502" }).message).toMatch(/required value/i);
  });

  it("maps permission errors", () => {
    expect(describeDbError({ code: "42501" }).message).toMatch(/permission/i);
  });

  it("maps auth/session errors", () => {
    expect(describeDbError({ code: "PGRST301" }).message).toMatch(/session/i);
    expect(describeDbError({ code: "401" }).message).toMatch(/session/i);
  });

  it("uses the fallback message for unknown codes", () => {
    expect(describeDbError({ code: "99999" }).message).toBe("Couldn't save your changes.");
    expect(describeDbError(null).message).toBe("Couldn't save your changes.");
    expect(describeDbError(undefined, "Custom fallback").message).toBe("Custom fallback");
  });
});

describe("action", () => {
  it("wraps a successful result", async () => {
    const res = await action(async () => 42);
    expect(res).toEqual({ ok: true, data: 42 });
  });

  it("captures an AppError with its hint", async () => {
    const res = await action(async () => {
      throw new AppError("nope", "try later");
    });
    expect(res).toEqual({ ok: false, error: "nope", hint: "try later" });
  });

  it("captures a plain Error with a generic hint", async () => {
    const res = await action(async () => {
      throw new Error("kaboom");
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("kaboom");
      expect(res.hint).toMatch(/try again/i);
    }
  });

  it("handles non-Error throws", async () => {
    const res = await action(async () => {
      throw "string error";
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Something went wrong.");
  });
});
