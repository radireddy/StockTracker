import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isinSchema = z.string().regex(/^INE[A-Z0-9]{9}$/, "Invalid ISIN format");

/** Manual holding add/edit — always scoped to an account. */
export const holdingSchema = z.object({
  account_id: uuidSchema,
  isin: isinSchema,
  quantity: z.number().positive("Quantity must be positive"),
  avg_buy_price: z.number().nonnegative("Average price cannot be negative"),
});

export const companyCreateSchema = z.object({
  portfolio_id: uuidSchema,
  isin: isinSchema,
  strategy: z.string().max(100).optional().nullable(),
  investment_horizon_years: z.number().int().min(0).max(30).optional(),
  star_rating: z.number().int().min(1).max(5).optional(),
  buy_price: z.number().nonnegative().optional().nullable(),
});

/**
 * Add a company with an OPTIONAL, all-or-nothing holding position.
 * Research fields are all optional. If any position field is provided,
 * account + quantity + avg_buy_price must all be provided together.
 */
export const companyWithHoldingSchema = z
  .object({
    portfolio_id: uuidSchema,
    isin: isinSchema,
    // research (all optional)
    strategy: z.string().max(100).optional().nullable(),
    investment_horizon_years: z.number().int().min(0).max(30).optional(),
    star_rating: z.number().int().min(1).max(5).optional(),
    buy_price: z.number().nonnegative().optional().nullable(),
    // position (all-or-nothing)
    account_id: uuidSchema.optional().nullable(),
    new_account_label: z.string().min(1).max(100).optional(),
    quantity: z.number().positive().optional(),
    avg_buy_price: z.number().nonnegative().optional(),
  })
  .refine(
    (d) => {
      const hasAccount = Boolean(d.account_id || d.new_account_label);
      const hasQty = d.quantity !== undefined;
      const hasPrice = d.avg_buy_price !== undefined;
      const some = hasAccount || hasQty || hasPrice;
      const all = hasAccount && hasQty && hasPrice;
      return !some || all;
    },
    { message: "Enter account, quantity and avg price together" }
  );

export const portfolioSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["holdings", "watchlist"]),
});

export const accountSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  broker: z.string().max(50).optional(),
  client_id: z.string().max(50).optional().or(z.literal("")),
  pan_number: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN format")
    .optional()
    .or(z.literal("")),
  mobile: z.string().max(15).optional().or(z.literal("")),
});

export const dashboardQuerySchema = z.object({
  portfolioId: uuidSchema,
  portfolioType: z.enum(["holdings", "watchlist"]),
});
