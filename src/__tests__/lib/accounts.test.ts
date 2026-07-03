import { describe, it, expect, vi } from "vitest";
import { resolveAccountId } from "@/lib/accounts";

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
