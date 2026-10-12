import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import { adjustStock } from "@/server/services/inventory";
import { createOrder, transitionOrder } from "@/server/services/orders";
import { count, makeProduct, makeWorkspace, stockOf, useCleanDatabase } from "../helpers";

useCleanDatabase();

/**
 * These run truly in parallel on separate pooled connections against real Postgres,
 * so they exercise row locking, not just application logic.
 */
describe("concurrency", () => {
  it("competing orders can never jointly consume more stock than exists", async () => {
    const { ownerActor, staffActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 5 });
    const attempts = Array.from({ length: 12 }, (_, i) =>
      createOrder(i % 2 ? ownerActor : staffActor, { items: [{ productId: p.id, quantity: 1 }] }),
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(5);
    expect(failed).toHaveLength(7);
    for (const f of failed) expect((f.reason as AppError).code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(p.id)).toBe(0);
    expect(await count("orders")).toBe(5);
  });

  it("multi-line orders racing over shared products stay consistent (and do not deadlock)", async () => {
    const { ownerActor } = await makeWorkspace();
    const a = await makeProduct(ownerActor, { stockQuantity: 6 });
    const b = await makeProduct(ownerActor, { stockQuantity: 6 });
    // Lines given in opposite orders: without a consistent lock order this can deadlock.
    const attempts = Array.from({ length: 10 }, (_, i) =>
      createOrder(ownerActor, {
        items: i % 2 ? [{ productId: a.id, quantity: 2 }, { productId: b.id, quantity: 1 }] : [{ productId: b.id, quantity: 1 }, { productId: a.id, quantity: 2 }],
      }),
    );
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3); // a runs out after 3 orders of 2
    expect(await stockOf(a.id)).toBe(0);
    expect(await stockOf(b.id)).toBe(3);
  });

  it("parallel cancellations restore stock only once", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    const { order } = await createOrder(ownerActor, { items: [{ productId: p.id, quantity: 4 }] });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => transitionOrder(ownerActor, order.id, { action: "cancel" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOf(p.id)).toBe(10);
  });

  it("concurrent manual adjustments never drive stock below zero", async () => {
    const { ownerActor, staffActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => adjustStock(i % 2 ? ownerActor : staffActor, p.id, { type: "damaged", quantityChange: -3 })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(await stockOf(p.id)).toBe(1);
  });

  it("concurrent retries with one Idempotency-Key create a single order", async () => {
    const { ownerActor } = await makeWorkspace();
    const p = await makeProduct(ownerActor, { stockQuantity: 10 });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => createOrder(ownerActor, { items: [{ productId: p.id, quantity: 1 }] }, "retry-key-0001")),
    );
    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(await count("orders")).toBe(1);
    expect(await stockOf(p.id)).toBe(9);
  });
});
