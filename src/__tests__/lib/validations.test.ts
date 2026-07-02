import { describe, it, expect } from "vitest";
import { companyWithHoldingSchema, moveToHoldingsSchema } from "@/lib/validations";

const PID = "550e8400-e29b-41d4-a716-446655440000";
const AID = "550e8400-e29b-41d4-a716-446655440001";
const ISIN = "INE002A01018";

describe("companyWithHoldingSchema", () => {
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

  it("accepts optional research fields alongside the position", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, quantity: 10, avg_buy_price: 100,
      star_rating: 3, strategy: "core", investment_horizon_years: 3, buy_price: 90,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an account with deferred quantity & price", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, account_id: AID });
    expect(r.success).toBe(true);
  });

  it("rejects a research-only company (account is mandatory)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, star_rating: 3 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Account is required");
    }
  });

  it("rejects a missing account even when qty & price are given", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, quantity: 10, avg_buy_price: 100,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Account is required");
    }
  });

  it("rejects a non-positive quantity when one is supplied", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, quantity: 0,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bad ISIN", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: "BAD", account_id: AID, quantity: 10, avg_buy_price: 100,
    });
    expect(r.success).toBe(false);
  });
});

describe("moveToHoldingsSchema", () => {
  const AID = "550e8400-e29b-41d4-a716-446655440001";

  it("accepts an existing account with no qty/price", () => {
    expect(moveToHoldingsSchema.safeParse({ account_id: AID }).success).toBe(true);
  });
  it("accepts a new account label with qty and price", () => {
    const r = moveToHoldingsSchema.safeParse({
      new_account_label: "Father – Groww",
      quantity: 10,
      avg_buy_price: 245.5,
    });
    expect(r.success).toBe(true);
  });
  it("rejects when no account is provided", () => {
    expect(moveToHoldingsSchema.safeParse({ quantity: 10 }).success).toBe(false);
  });
  it("rejects a non-positive quantity", () => {
    expect(moveToHoldingsSchema.safeParse({ account_id: AID, quantity: 0 }).success).toBe(false);
  });
  it("rejects a negative avg price", () => {
    expect(
      moveToHoldingsSchema.safeParse({ account_id: AID, avg_buy_price: -1 }).success
    ).toBe(false);
  });
});
