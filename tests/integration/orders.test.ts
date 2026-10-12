import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { orders, stockMovements } from "@/server/db/schema";
import { adjustStock } from "@/server/services/inventory";
import { createOrder, getOrder, transitionOrder } from "@/server/services/orders";
import { updateProduct } from "@/server/services/products";
import { count, makeProduct, makeWorkspace, stockOf, useCleanDatabase } from "../helpers";

useCleanDatabase();

describe("order totals", () => {
  it("computes line and order totals on the server and ignores a client total", async () => {
    const { ownerActor } = await makeWorkspace();
    const a = await makeProduct(ownerActor, { unitPrice: "19.99", stockQuantity: 10 });
    const b = await makeProduct(ownerActor, { unitPrice: "0.10", stockQuantity: 10 });
    const { order } = await createOrder(ownerActor, {
      items: [
        { productId: a.id, quantity: 3 },
        { productId: b.id, quantity: 3 },
      ],
      total: "1.00",
      items_total: "1.00",
    });
    const lines = Object.fromEntries(order.items.map((i) => [i.productId, i.lineTotal]));
    expect(lines[a.id]).toBe("59.97");
    expect(lines[b.id]).toBe("0.30");
    expect(order.total).toBe("60.27");
    expect(order.status).toBe("pending");
    expect(order.number).toBe(1001);
  });

  it("combines duplicate lines for the same product", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { unitPrice: "2.50", stockQuantity: 10 });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 2 }, { productId: p.id, quantity: 3 }] });
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(5);
    expect(order.total).toBe("12.50");
    expect(await stockOf(p.id)).toBe(5);
  });
});

describe("stock strategy: reserve at creation", () => {
  it("reserves on create, no change on confirm/complete", async () => {
    const { ownerActor, staffActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    const { order } = await createOrder(staffActor, { items: [{ productId: p.id, quantity: 4 }] });
    expect(await stockOf(p.id)).toBe(6);
    await transitionOrder(staffActor, order.id, { action: "confirm" });
    expect(await stockOf(p.id)).toBe(6);
    const done = await transitionOrder(ownerActor, order.id, { action: "complete" });
    expect(done.status).toBe("completed");
    expect(done.completedAt).not.toBeNull();
    expect(await stockOf(p.id)).toBe(6);
  });

  it("rejects an order when stock is insufficient", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 2 });
    await expect(createOrder(ownerActor, { items: [{ productId: p.id, quantity: 3 }] })).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
      details: { available: 2, requested: 3 },
    });
    expect(await stockOf(p.id)).toBe(2);
    expect(await count("orders")).toBe(0);
  });

  it("rejects inactive products for new orders but keeps history on existing ones", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 5, name: "Old Mug" });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 1 }] });
    await updateProduct(ownerActor, p.id, { isActive: false });
    await expect(createOrder(ownerActor, { items: [{ productId: p.id, quantity: 1 }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const again = await getOrder(ownerActor, order.id);
    expect(again.items[0].productName).toBe("Old Mug");
  });
});

describe("multi-item atomicity", () => {
  it("leaves no order, items, stock change or ledger rows when a later line fails", async () => {
    const { ownerActor } = await makeWorkspace();
    const ok1 = await makeProduct(ownerActor, { stockQuantity: 10 });
    const ok2 = await makeProduct(ownerActor, { stockQuantity: 10 });
    const short = await makeProduct(ownerActor, { stockQuantity: 1 });
    const movementsBefore = await count("stock_movements");
    await expect(
      createOrder(ownerActor, {
        items: [
          { productId: ok1.id, quantity: 2 },
          { productId: ok2.id, quantity: 2 },
          { productId: short.id, quantity: 5 },
        ],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect([await stockOf(ok1.id), await stockOf(ok2.id), await stockOf(short.id)]).toEqual([10, 10, 1]);
    expect(await count("orders")).toBe(0);
    expect(await count("order_items")).toBe(0);
    expect(await count("stock_movements")).toBe(movementsBefore);
  });

  it("rolls back when one line references an unknown product", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    await expect(
      createOrder(ownerActor, { items: [{ productId: p.id, quantity: 1 }, { productId: "00000000-0000-4000-8000-0000000000ff", quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await stockOf(p.id)).toBe(10);
    expect(await count("orders")).toBe(0);
  });
});

describe("cancellation", () => {
  it("restores stock exactly once, even when repeated", async () => {
    const { ownerActor } = await makeWorkspace();
    const a = await makeProduct(ownerActor, { stockQuantity: 10 });
    const b = await makeProduct(ownerActor, { stockQuantity: 10 });
    const { order } = await createOrder(ownerActor, { items: [{ productId: a.id, quantity: 3 }, { productId: b.id, quantity: 7 }] });
    await transitionOrder(ownerActor, order.id, { action: "confirm" });
    const cancelled = await transitionOrder(ownerActor, order.id, { action: "cancel" });
    expect(cancelled.status).toBe("cancelled");
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([10, 10]);

    await expect(transitionOrder(ownerActor, order.id, { action: "cancel" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transitionOrder(ownerActor, order.id, { action: "cancel" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect([await stockOf(a.id), await stockOf(b.id)]).toEqual([10, 10]);
    const releases = await getDb().select().from(stockMovements).where(eq(stockMovements.orderId, order.id));
    expect(releases.filter((m) => m.type === "order_released")).toHaveLength(2);
  });

  it("restores stock even if the product was deactivated meanwhile", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 5 });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 5 }] });
    await updateProduct(ownerActor, p.id, { isActive: false });
    await transitionOrder(ownerActor, order.id, { action: "cancel" });
    expect(await stockOf(p.id)).toBe(5);
  });

  it("the database refuses a second release row for the same order line", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 5 });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 1 }] });
    await transitionOrder(ownerActor, order.id, { action: "cancel" });
    await expect(
      getDb().insert(stockMovements).values({
        workspaceId: ownerActor.workspaceId,
        productId: p.id,
        orderId: order.id,
        type: "order_released",
        quantityChange: 1,
        resultingQuantity: 6,
        actorId: ownerActor.userId,
      }),
    ).rejects.toThrow();
  });
});

describe("state transitions", () => {
  it("rejects invalid transitions", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 1 }] });
    await expect(transitionOrder(ownerActor, order.id, { action: "complete" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await transitionOrder(ownerActor, order.id, { action: "confirm" });
    await expect(transitionOrder(ownerActor, order.id, { action: "confirm" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await transitionOrder(ownerActor, order.id, { action: "complete" });
    await expect(transitionOrder(ownerActor, order.id, { action: "cancel" })).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await expect(transitionOrder(ownerActor, order.id, { action: "ship" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await stockOf(p.id)).toBe(9);
  });
});

describe("price snapshots", () => {
  it("keeps historical line prices and totals when the catalogue price changes", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { unitPrice: "12.00", stockQuantity: 10, name: "Kettle", sku: "KTL" });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 2 }] });
    await updateProduct(ownerActor, p.id, { unitPrice: "99.00", name: "Kettle Pro", sku: "KTL-PRO" });
    const after = await getOrder(ownerActor, order.id);
    expect(after.items[0]).toMatchObject({ unitPrice: "12.00", lineTotal: "24.00", productName: "Kettle", productSku: "KTL" });
    expect(after.total).toBe("24.00");
  });
});

describe("idempotency", () => {
  it("returns the same order for a retried request with the same Idempotency-Key", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    const body = { items: [{ productId: p.id, quantity: 2 }] };
    const first = await createOrder(ownerActor, body, "key-abcdef-123");
    const second = await createOrder(ownerActor, body, "key-abcdef-123");
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(await stockOf(p.id)).toBe(8);
    expect(await count("orders")).toBe(1);
  });

  it("manual adjustments and orders share one consistent ledger", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 4 });
    await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 4 }] });
    await expect(adjustStock(ownerActor, p.id, { type: "lost", quantityChange: -1 })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    const rows = await getDb().select().from(stockMovements).where(eq(stockMovements.productId, p.id));
    expect(rows.reduce((s, r) => s + r.quantityChange, 0)).toBe(await stockOf(p.id));
    const o = await getDb().select().from(orders);
    expect(o).toHaveLength(1);
  });
});
