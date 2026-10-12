import { describe, expect, it } from "vitest";
import { lineTotal, sumMoney } from "@/lib/money";
import { allowedActions, canTransition } from "@/lib/order-lifecycle";
import { normaliseLines } from "@/server/services/orders";
import { adjustStockSchema, createOrderSchema, createProductSchema } from "@/server/validation/schemas";

describe("money", () => {
  it("avoids floating point drift", () => {
    expect(lineTotal("0.10", 3)).toBe("0.30");
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(lineTotal("19.99", 7)).toBe("139.93");
  });
});

describe("order lifecycle table", () => {
  it("allows only the documented transitions", () => {
    expect(allowedActions("pending")).toEqual(["confirm", "cancel"]);
    expect(allowedActions("confirmed")).toEqual(["complete", "cancel"]);
    expect(allowedActions("completed")).toEqual([]);
    expect(allowedActions("cancelled")).toEqual([]);
    expect(canTransition("pending", "complete")).toBe(false);
    expect(canTransition("cancelled", "cancel")).toBe(false);
  });
});

describe("line normalisation", () => {
  it("merges duplicate products and sorts by id for a stable lock order", () => {
    const a = "00000000-0000-4000-8000-000000000002";
    const b = "00000000-0000-4000-8000-000000000001";
    expect(normaliseLines([{ productId: a, quantity: 2 }, { productId: b, quantity: 1 }, { productId: a, quantity: 3 }])).toEqual([
      { productId: b, quantity: 1 },
      { productId: a, quantity: 5 },
    ]);
  });
});

describe("validation", () => {
  it("rejects negative/float prices and quantities", () => {
    expect(createProductSchema.safeParse({ name: "A", sku: "A1", unitPrice: "-1" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "A", sku: "A1", unitPrice: "1.999" }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "A", sku: "A1", unitPrice: "1.5", stockQuantity: 1.5 }).success).toBe(false);
    expect(createProductSchema.safeParse({ name: "A", sku: "a1", unitPrice: "1.5" }).data?.sku).toBe("A1");
  });
  it("enforces adjustment direction per reason", () => {
    expect(adjustStockSchema.safeParse({ type: "received", quantityChange: -3 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ type: "damaged", quantityChange: 3 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ type: "correction", quantityChange: 0 }).success).toBe(false);
    expect(adjustStockSchema.safeParse({ type: "correction", quantityChange: -3 }).success).toBe(true);
  });
  it("strips client supplied totals from an order payload", () => {
    const parsed = createOrderSchema.parse({
      items: [{ productId: "00000000-0000-4000-8000-000000000001", quantity: 1 }],
      total: "0.01",
    } as unknown);
    expect(parsed).not.toHaveProperty("total");
    expect(createOrderSchema.safeParse({ items: [{ productId: "00000000-0000-4000-8000-000000000001", quantity: 0 }] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ items: [] }).success).toBe(false);
  });
});

import { startOfDayIn, dayRangeToInstants } from "@/lib/timezone";

describe("time zone day bounds", () => {
  it("handles legacy aliases and DST", () => {
    expect(startOfDayIn("2026-10-12", "Asia/Calcutta").toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(startOfDayIn("2026-10-12", "UTC").toISOString()).toBe("2026-10-12T00:00:00.000Z");
    // US DST starts 2026-03-08: that day begins at UTC-5, the next at UTC-4
    expect(startOfDayIn("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfDayIn("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
    const r = dayRangeToInstants({ from: "2026-01-01", to: "2026-01-31", tz: "Asia/Kolkata" });
    expect(r.end!.getTime() - r.start!.getTime()).toBe(31 * 86_400_000);
  });
});
