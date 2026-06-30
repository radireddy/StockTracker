import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const isinSchema = z.string().regex(/^INE[A-Z0-9]{9}$/, "Invalid ISIN format");

export const transactionSchema = z.object({
  company_id: uuidSchema,
  owner_id: uuidSchema,
  type: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive("Quantity must be positive"),
  price: z.number().nonnegative("Price cannot be negative"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  fees: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

export const companyCreateSchema = z.object({
  portfolio_id: uuidSchema,
  isin: isinSchema,
  strategy: z.string().max(100).optional().nullable(),
  investment_horizon_years: z.number().int().min(0).max(30).optional(),
  star_rating: z.number().int().min(1).max(5).optional(),
  buy_price: z.number().nonnegative().optional().nullable(),
});

export const portfolioSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["holdings", "watchlist"]),
});

export const ownerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
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
