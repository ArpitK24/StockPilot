import { z } from "zod";
import { MONEY_PATTERN } from "@/lib/money";
import { dateRangeSchema, paginationSchema, uuidSchema } from "./common";

const trimmed = (max: number, label: string) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

// ---------- auth ----------
export const registerSchema = z.object({
  name: trimmed(80, "Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  password: z.string().min(8, "Use at least 8 characters").max(128, "Password is too long"),
  workspaceName: trimmed(80, "Workspace name"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(128),
});

// ---------- workspaces / members ----------
export const createWorkspaceSchema = z.object({ name: trimmed(80, "Workspace name") });

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["owner", "staff"]).default("staff"),
});

// ---------- products ----------
const nonNegInt = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(1_000_000_000, `${label} is too large`);

const price = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => MONEY_PATTERN.test(v), "Enter a non-negative amount with up to 2 decimals");

export const skuSchema = z
  .string()
  .trim()
  .min(1, "SKU is required")
  .max(64, "SKU must be at most 64 characters")
  .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, "Use letters, digits, and . _ - /")
  .transform((s) => s.toUpperCase());

export const createProductSchema = z.object({
  name: trimmed(120, "Name"),
  sku: skuSchema,
  description: z
    .string()
    .trim()
    .max(2000, "Description is too long")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  unitPrice: price,
  stockQuantity: nonNegInt("Opening stock").default(0),
  lowStockThreshold: nonNegInt("Low-stock threshold").default(0),
});

/** Stock is deliberately NOT editable here: it only changes through the ledger. */
export const updateProductSchema = z
  .object({
    name: trimmed(120, "Name"),
    sku: skuSchema,
    description: createProductSchema.shape.description,
    unitPrice: price,
    lowStockThreshold: nonNegInt("Low-stock threshold"),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const productListSchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  stock: z.enum(["all", "low", "out"]).default("all"),
  sort: z.enum(["name", "sku", "stock", "price", "updated"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

// ---------- inventory ----------
export const MANUAL_REASONS = ["received", "returned", "correction", "damaged", "lost"] as const;
export type ManualReason = (typeof MANUAL_REASONS)[number];

export const adjustStockSchema = z
  .object({
    type: z.enum(MANUAL_REASONS, { message: "Choose a reason" }),
    quantityChange: z.coerce
      .number({ message: "Quantity must be a number" })
      .int("Quantity must be a whole number")
      .refine((n) => n !== 0, "Quantity cannot be zero")
      .refine((n) => Math.abs(n) <= 1_000_000, "Quantity is too large"),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === "received" || v.type === "returned") && v.quantityChange < 0)
      ctx.addIssue({ code: "custom", path: ["quantityChange"], message: `A "${v.type}" adjustment must add stock` });
    if ((v.type === "damaged" || v.type === "lost") && v.quantityChange > 0)
      ctx.addIssue({ code: "custom", path: ["quantityChange"], message: `A "${v.type}" adjustment must remove stock` });
  });

export const movementListSchema = paginationSchema
  .extend({
    productId: uuidSchema.optional(),
    type: z
      .enum(["received", "returned", "correction", "damaged", "lost", "order_reserved", "order_released"])
      .optional(),
  })
  .and(dateRangeSchema);

// ---------- orders ----------
export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: uuidSchema,
        quantity: z.coerce
          .number({ message: "Quantity must be a number" })
          .int("Quantity must be a whole number")
          .min(1, "Quantity must be at least 1")
          .max(100_000, "Quantity is too large"),
      }),
    )
    .min(1, "Add at least one product")
    .max(100, "An order can have at most 100 lines"),
  note: z.string().trim().max(500).optional().nullable(),
  // Anything else the client sends (e.g. `total`) is stripped by zod and never trusted.
});

export const ORDER_ACTIONS = ["confirm", "complete", "cancel"] as const;
export const orderActionSchema = z.object({ action: z.enum(ORDER_ACTIONS, { message: "Unknown action" }) });

export const orderListSchema = paginationSchema
  .extend({
    status: z.enum(["pending", "confirmed", "completed", "cancelled"]).optional(),
    q: z.string().trim().max(20).optional(), // order number, with or without '#'
  })
  .and(dateRangeSchema);

export const dashboardSchema = dateRangeSchema;
