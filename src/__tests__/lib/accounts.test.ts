import { describe, it, expect, vi } from "vitest";
import {
  resolveAccountId,
  buildAccountUpdate,
  matchAccount,
  shouldBackfillClientId,
  classifyDetection,
} from "@/lib/accounts";

const USER = "user-1";
const AID = "acc-123";

function clientReturningInsert(result: { data?: unknown; error?: unknown }) {
  return {
    from() {
      const b: Record<string, unknown> = {
        insert() { return b; },
        select() { return b; },
        single() { return Promise.resolve(result); },
      };
      return b;
    },
  } as never;
}

describe("resolveAccountId", () => {
  it("returns an existing account id without touching the db", async () => {
    const spy = vi.fn();
    const client = { from: spy } as never;
    await expect(resolveAccountId(client, USER, { account_id: AID })).resolves.toBe(AID);
    expect(spy).not.toHaveBeenCalled();
  });

  it("creates a manual account from a new label", async () => {
    const client = clientReturningInsert({ data: { id: "new-acc" }, error: null });
    await expect(
      resolveAccountId(client, USER, { new_account_label: "  Father – Groww  " })
    ).resolves.toBe("new-acc");
  });

  it("throws a friendly message on duplicate label", async () => {
    const client = clientReturningInsert({ data: null, error: { code: "23505" } });
    await expect(
      resolveAccountId(client, USER, { new_account_label: "Dup" })
    ).rejects.toThrow(/already exists/);
  });

  it("surfaces the db message for a non-duplicate error", async () => {
    const client = clientReturningInsert({
      data: null,
      error: { code: "23503", message: "insert violates foreign key" },
    });
    await expect(
      resolveAccountId(client, USER, { new_account_label: "X" })
    ).rejects.toThrow("insert violates foreign key");
  });

  it("falls back to a generic message when the error carries no message", async () => {
    const client = clientReturningInsert({ data: null, error: { code: "500" } });
    await expect(
      resolveAccountId(client, USER, { new_account_label: "X" })
    ).rejects.toThrow("Failed to create account");
  });

  it("throws when neither id nor label is given", async () => {
    const client = { from: vi.fn() } as never;
    await expect(resolveAccountId(client, USER, {})).rejects.toThrow("Account is required");
  });
});

describe("buildAccountUpdate", () => {
  it("trims label and includes only provided keys", () => {
    expect(buildAccountUpdate({ label: "  My Zerodha  " })).toEqual({ label: "My Zerodha" });
  });
  it("nulls empty client_id/pan/mobile", () => {
    expect(buildAccountUpdate({ client_id: "  ", pan_number: "", mobile: "" })).toEqual({
      client_id: null,
      pan_number: null,
      mobile: null,
    });
  });
  it("keeps a real client_id and omits empty broker", () => {
    expect(buildAccountUpdate({ client_id: " YY7859 ", broker: "  " })).toEqual({ client_id: "YY7859" });
  });
});

describe("matchAccount", () => {
  const accts = [
    { id: "a1", label: "My Zerodha", broker: "zerodha", client_id: "YY7859" },
    { id: "a2", label: "Manual", broker: "manual", client_id: null },
  ];
  it("matches on broker + client_id", () => {
    expect(matchAccount(accts, "zerodha", "YY7859")).toEqual({ id: "a1", label: "My Zerodha" });
  });
  it("returns null with no client id", () => {
    expect(matchAccount(accts, "zerodha", null)).toBeNull();
  });
  it("returns null when no account matches", () => {
    expect(matchAccount(accts, "zerodha", "ZZ0000")).toBeNull();
  });
});

describe("shouldBackfillClientId", () => {
  it("true when account has no client id and a client id is given", () => {
    expect(shouldBackfillClientId({ client_id: null }, "YY7859")).toBe(true);
  });
  it("false when account already has a client id", () => {
    expect(shouldBackfillClientId({ client_id: "AA1111" }, "YY7859")).toBe(false);
  });
  it("false when no client id given", () => {
    expect(shouldBackfillClientId({ client_id: null }, null)).toBe(false);
  });
});

describe("classifyDetection", () => {
  it("matched when an account id is present", () => {
    expect(classifyDetection({ clientId: "YY7859", matchedAccountId: "a1" })).toBe("matched");
  });
  it("unmatched when client id present but no match", () => {
    expect(classifyDetection({ clientId: "YY7859", matchedAccountId: null })).toBe("unmatched");
  });
  it("no-client-id when client id missing", () => {
    expect(classifyDetection({ clientId: null, matchedAccountId: null })).toBe("no-client-id");
  });
});
