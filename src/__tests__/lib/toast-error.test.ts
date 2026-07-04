import { describe, it, expect, vi, beforeEach } from "vitest";
import { toastError, isOk } from "@/lib/toast-error";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const mockToast = vi.mocked(toast.error);

describe("toastError", () => {
  beforeEach(() => mockToast.mockClear());

  it("shows an ActionResult failure with its message and hint", () => {
    toastError({ ok: false, error: "Name taken", hint: "Pick another" });
    expect(mockToast).toHaveBeenCalledWith("Name taken", {
      description: "Pick another",
      action: undefined,
    });
  });

  it("falls back to the default hint when a result has none", () => {
    toastError({ ok: false, error: "Boom" });
    expect(mockToast).toHaveBeenCalledWith(
      "Boom",
      expect.objectContaining({ description: expect.stringMatching(/try again/i) })
    );
  });

  it("uses a thrown Error's message", () => {
    toastError(new Error("network down"));
    expect(mockToast).toHaveBeenCalledWith("network down", expect.any(Object));
  });

  it("replaces a redacted production message with generic copy", () => {
    toastError(new Error("An error occurred in the Server Components render"));
    const [message] = mockToast.mock.calls[0];
    expect(message).toBe("Something went wrong.");
  });

  it("honours a message override and adds a Retry action", () => {
    const retry = vi.fn();
    toastError(new Error("x"), { message: "Couldn't load accounts", retry });
    const [message, config] = mockToast.mock.calls[0];
    expect(message).toBe("Couldn't load accounts");
    expect(config?.action).toEqual({ label: "Retry", onClick: retry });
  });

  it("handles unknown throw values", () => {
    toastError("just a string");
    expect(mockToast).toHaveBeenCalledWith("Something went wrong.", expect.any(Object));
  });
});

describe("isOk", () => {
  it("narrows success and failure results", () => {
    expect(isOk({ ok: true, data: 1 })).toBe(true);
    expect(isOk({ ok: false, error: "x" })).toBe(false);
  });
});
