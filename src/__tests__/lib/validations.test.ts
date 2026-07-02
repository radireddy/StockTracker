import { describe, it, expect } from "vitest";
import { companyWithHoldingSchema } from "@/lib/validations";

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

  it("rejects a research-only company (position is mandatory)", () => {
    const r = companyWithHoldingSchema.safeParse({ portfolio_id: PID, isin: ISIN, star_rating: 3 });
    expect(r.success).toBe(false);
  });

  it("rejects a missing account", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, quantity: 10, avg_buy_price: 100,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("Account is required");
    }
  });

  it("rejects a missing quantity", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, avg_buy_price: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, quantity: 0, avg_buy_price: 100,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a missing avg buy price", () => {
    const r = companyWithHoldingSchema.safeParse({
      portfolio_id: PID, isin: ISIN, account_id: AID, quantity: 10,
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
