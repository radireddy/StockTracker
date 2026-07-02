import { describe, it, expect } from "vitest";
import { companyWithHoldingSchema } from "@/lib/validations";

const PID = "550e8400-e29b-41d4-a716-446655440000";
const AID = "550e8400-e29b-41d4-a716-446655440001";
const ISIN = "INE002A01018";

describe("companyWithHoldingSchema", () => {
  it("accepts research-only (no position)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, star_rating: 3 });
    expect(r.success).toBe(true);
  });

  it("accepts a full position with an existing account", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, quantity: 10, avg_buy_price: 100,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a full position with a new account label", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, new_account_label: "Dad – Groww", quantity: 5, avg_buy_price: 50,
    });
    expect(r.success).toBe(true);
  });

  it("rejects a partial position (qty only)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, quantity: 10 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Enter account, quantity and avg price together");
    }
  });

  it("rejects a partial position (account only)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, account_id: AID });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Enter account, quantity and avg price together");
    }
  });

  it("rejects a partial position (price only)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, avg_buy_price: 100 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Enter account, quantity and avg price together");
    }
  });

  it("rejects a bad ISIN", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: "BAD" });
    expect(r.success).toBe(false);
  });
});
