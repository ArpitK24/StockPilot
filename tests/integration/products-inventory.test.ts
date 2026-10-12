import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { stockMovements } from "@/server/db/schema";
import { adjustStock, listMovements } from "@/server/services/inventory";
import { createProduct, listProducts, updateProduct } from "@/server/services/products";
import { makeProduct, makeWorkspace, stockOf, useCleanDatabase } from "../helpers";
import { eq } from "drizzle-orm";

useCleanDatabase();

describe("SKU uniqueness", () => {
  it("rejects a duplicate SKU in the same workspace (case-insensitive) but allows it in another", async () => {
    const a = await makeWorkspace("A");
    const b = await makeWorkspace("B");
    await makeProduct(a.ownerActor, { sku: "MUG-01" });
    await expect(makeProduct(a.ownerActor, { sku: "mug-01" })).rejects.toMatchObject({ code: "CONFLICT", fields: { sku: expect.any(String) } });
    await expect(makeProduct(b.ownerActor, { sku: "MUG-01" })).resolves.toMatchObject({ sku: "MUG-01" });
  });

  it("rejects renaming a product onto an existing SKU", async () => {
    const a = await makeWorkspace();
    await makeProduct(a.ownerActor, { sku: "ONE" });
    const two = await makeProduct(a.ownerActor, { sku: "TWO" });
    await expect(updateProduct(a.ownerActor, two.id, { sku: "ONE" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("product validation", () => {
  it("validates server side", async () => {
    const a = await makeWorkspace();
    await expect(createProduct(a.ownerActor, { name: "", sku: "", unitPrice: "-5" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { name: expect.any(String), sku: expect.any(String), unitPrice: expect.any(String) },
    });
  });

  it("does not allow stock to be edited directly", async () => {
    const a = await makeWorkspace();
    const p = await makeProduct(a.ownerActor, { stockQuantity: 5 });
    await updateProduct(a.ownerActor, p.id, { stockQuantity: 999, name: "Renamed" } as never);
    expect(await stockOf(p.id)).toBe(5);
  });

  it("filters low stock and paginates", async () => {
    const a = await makeWorkspace();
    await makeProduct(a.ownerActor, { name: "Low", stockQuantity: 1, lowStockThreshold: 3 });
    await makeProduct(a.ownerActor, { name: "Fine", stockQuantity: 50, lowStockThreshold: 3 });
    await makeProduct(a.ownerActor, { name: "Edge", stockQuantity: 3, lowStockThreshold: 3 });
    const low = await listProducts(a.ownerActor, { stock: "low" });
    expect(low.items.map((p) => p.name).sort()).toEqual(["Edge", "Low"]);
    const page = await listProducts(a.ownerActor, { pageSize: "2", page: "2" });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);
    await expect(listProducts(a.ownerActor, { pageSize: "1000" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("stock boundaries and audit history", () => {
  it("rejects adjustments that would make stock negative, leaving stock and ledger untouched", async () => {
    const a = await makeWorkspace();
    const p = await makeProduct(a.ownerActor, { stockQuantity: 3 });
    await expect(adjustStock(a.staffActor, p.id, { type: "damaged", quantityChange: -4 })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await stockOf(p.id)).toBe(3);
    const rows = await getDb().select().from(stockMovements).where(eq(stockMovements.productId, p.id));
    expect(rows).toHaveLength(1); // only the opening-stock row
  });

  it("rejects invalid adjustments with clear field errors", async () => {
    const a = await makeWorkspace();
    const p = await makeProduct(a.ownerActor);
    await expect(adjustStock(a.ownerActor, p.id, { type: "received", quantityChange: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(adjustStock(a.ownerActor, p.id, { type: "received", quantityChange: 1.5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(adjustStock(a.ownerActor, p.id, { type: "nope", quantityChange: 1 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("records every change with actor and resulting quantity; the ledger replays to current stock", async () => {
    const a = await makeWorkspace();
    const p = await makeProduct(a.ownerActor, { stockQuantity: 10 });
    await adjustStock(a.staffActor, p.id, { type: "received", quantityChange: 5, note: "PO-77" });
    await adjustStock(a.ownerActor, p.id, { type: "correction", quantityChange: -2 });
    await adjustStock(a.staffActor, p.id, { type: "damaged", quantityChange: -13 }); // to exactly zero is fine
    expect(await stockOf(p.id)).toBe(0);
    const history = await listMovements(a.ownerActor, { productId: p.id });
    expect(history.items.map((m) => m.resultingQuantity)).toEqual([0, 13, 15, 10]);
    expect(history.items[0].actorName).toBe("Acme Staff");
    const replay = history.items.reduce((s, m) => s + m.quantityChange, 0);
    expect(replay).toBe(0);
  });

  it("filters history by date range in a time zone", async () => {
    const a = await makeWorkspace();
    await makeProduct(a.ownerActor);
    const future = await listMovements(a.ownerActor, { from: "2999-01-01", tz: "Asia/Kolkata" });
    expect(future.total).toBe(0);
    await expect(listMovements(a.ownerActor, { from: "2026-02-10", to: "2026-01-01" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(listMovements(a.ownerActor, { tz: "Mars/Olympus" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
