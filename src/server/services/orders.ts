import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { lineTotal, sumMoney } from "@/lib/money";
import { ORDER_TRANSITIONS, type OrderAction } from "@/lib/order-lifecycle";
import type { Actor } from "../authz";
import { getDb } from "../db/client";
import { orderItems, orders, stockMovements, users, workspaces, type OrderStatus } from "../db/schema";
import { AppError, notFound, pgCode, pgConstraint, PG_UNIQUE_VIOLATION, validationError } from "../errors";
import { parse, uuidSchema } from "../validation/common";
import { createOrderSchema, orderActionSchema, orderListSchema } from "../validation/schemas";
import { applyStockChange, createdWithin } from "./inventory";
import { requirePermission } from "./products";

/**
 * STOCK STRATEGY: reserve at creation.
 *   create  (-> pending)        : stock is decremented for every line, atomically.
 *   confirm (pending -> confirmed): no stock effect.
 *   complete(confirmed -> completed): no stock effect; the reservation becomes final.
 *   cancel  (pending|confirmed -> cancelled): reserved stock is restored exactly once.
 */

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

/** Merge repeated products into one line and sort by id (consistent lock order => no deadlocks). */
export function normaliseLines(items: { productId: string; quantity: number }[]) {
  const merged = new Map<string, number>();
  for (const { productId, quantity } of items) merged.set(productId, (merged.get(productId) ?? 0) + quantity);
  return [...merged.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
}

export type CreateOrderResult = { order: OrderDetail; replayed: boolean };

/**
 * Creates a pending order and reserves stock for every line in ONE transaction.
 * If any line is invalid, inactive, from another workspace, or short on stock, the
 * transaction rolls back: no order row, no items, no stock change, no ledger rows.
 * Totals are computed here from the product rows locked by the stock UPDATE; any total
 * sent by the client is ignored (stripped during validation).
 */
export async function createOrder(actor: Actor, input: unknown, idempotencyKey?: string | null): Promise<CreateOrderResult> {
  requirePermission(actor, "order:create");
  const data = parse(createOrderSchema, input);
  if (idempotencyKey != null && !IDEMPOTENCY_KEY.test(idempotencyKey))
    throw validationError("Idempotency-Key must be 8-100 characters of A-Z, a-z, 0-9, _ or -");

  const lines = normaliseLines(data.items);
  if (lines.some((l) => l.quantity > 100_000))
    throw validationError("Some fields need attention", { items: "Quantity is too large" });

  if (idempotencyKey) {
    const existing = await findByIdempotencyKey(actor, idempotencyKey);
    if (existing) return { order: await getOrder(actor, existing), replayed: true };
  }

  const orderId = randomUUID();
  try {
    await getDb().transaction(async (tx) => {
      const [ws] = await tx
        .update(workspaces)
        .set({ nextOrderNumber: sql`${workspaces.nextOrderNumber} + 1` })
        .where(eq(workspaces.id, actor.workspaceId))
        .returning({ number: sql<number>`${workspaces.nextOrderNumber} - 1` });
      if (!ws) throw notFound("Workspace");

      await tx.insert(orders).values({
        id: orderId,
        workspaceId: actor.workspaceId,
        number: ws.number,
        status: "pending",
        total: "0.00",
        note: data.note || null,
        createdBy: actor.userId,
        idempotencyKey: idempotencyKey ?? null,
      });

      const totals: string[] = [];
      for (const line of lines) {
        const { product } = await applyStockChange(tx, {
          workspaceId: actor.workspaceId,
          productId: line.productId,
          delta: -line.quantity,
          type: "order_reserved",
          actorId: actor.userId,
          orderId,
          requireActive: true,
        });
        const lt = lineTotal(product.unitPrice, line.quantity);
        totals.push(lt);
        await tx.insert(orderItems).values({
          workspaceId: actor.workspaceId,
          orderId,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          unitPrice: product.unitPrice,
          quantity: line.quantity,
          lineTotal: lt,
        });
      }

      await tx.update(orders).set({ total: sumMoney(totals) }).where(eq(orders.id, orderId));
    });
  } catch (err) {
    // Two concurrent requests with the same Idempotency-Key: the loser returns the winner's order.
    if (idempotencyKey && pgCode(err) === PG_UNIQUE_VIOLATION && pgConstraint(err) === "orders_workspace_idem_uq") {
      const existing = await findByIdempotencyKey(actor, idempotencyKey);
      if (existing) return { order: await getOrder(actor, existing), replayed: true };
    }
    if (err instanceof AppError && err.code === "NOT_FOUND" && err.message.startsWith("Product"))
      throw validationError("One of the products is not available in this workspace", { items: "Unknown product" });
    throw err;
  }
  return { order: await getOrder(actor, orderId), replayed: false };
}

async function findByIdempotencyKey(actor: Actor, key: string) {
  const [row] = await getDb()
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.workspaceId, actor.workspaceId), eq(orders.idempotencyKey, key)))
    .limit(1);
  return row?.id;
}

/**
 * Applies a lifecycle action. The status flip is a conditional UPDATE
 * (`... WHERE status IN (allowed from-states)`), so of two concurrent or repeated
 * requests only one can win; the loser sees 0 rows and gets INVALID_TRANSITION.
 * Stock is restored only by the transaction that actually flipped the order to
 * cancelled, hence at most once. A partial unique index on stock_movements
 * (order_id, product_id, type) enforces the same rule in the database.
 */
export async function transitionOrder(actor: Actor, orderId: string, input: unknown) {
  requirePermission(actor, "order:transition");
  if (!uuidSchema.safeParse(orderId).success) throw notFound("Order");
  const { action } = parse(orderActionSchema, input);
  const rule = ORDER_TRANSITIONS[action];

  await getDb().transaction(async (tx) => {
    const stamp = { confirm: "confirmedAt", complete: "completedAt", cancel: "cancelledAt" } as const;
    const [flipped] = await tx
      .update(orders)
      .set({ status: rule.to, [stamp[action]]: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.workspaceId, actor.workspaceId),
          inArray(orders.status, rule.from as unknown as OrderStatus[]),
        ),
      )
      .returning({ id: orders.id, number: orders.number });

    if (!flipped) {
      const [current] = await tx
        .select({ status: orders.status, number: orders.number })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.workspaceId, actor.workspaceId)))
        .limit(1);
      if (!current) throw notFound("Order");
      throw new AppError(
        "INVALID_TRANSITION",
        `Order #${current.number} is ${current.status}; it cannot be ${PAST[action]}`,
        undefined,
        { status: current.status, action },
      );
    }

    if (action === "cancel") {
      const items = await tx
        .select({ productId: orderItems.productId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId))
        .orderBy(asc(orderItems.productId));
      for (const item of items) {
        await applyStockChange(tx, {
          workspaceId: actor.workspaceId,
          productId: item.productId,
          delta: item.quantity,
          type: "order_released",
          actorId: actor.userId,
          orderId,
          note: `Order #${flipped.number} cancelled`,
        });
      }
    }
  });

  return getOrder(actor, orderId);
}

const PAST: Record<OrderAction, string> = { confirm: "confirmed", complete: "completed", cancel: "cancelled" };

export type OrderDetail = Awaited<ReturnType<typeof getOrder>>;

export async function getOrder(actor: Actor, orderId: string) {
  requirePermission(actor, "order:read");
  if (!uuidSchema.safeParse(orderId).success) throw notFound("Order");
  const db = getDb();
  const [order] = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      total: orders.total,
      note: orders.note,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      confirmedAt: orders.confirmedAt,
      completedAt: orders.completedAt,
      cancelledAt: orders.cancelledAt,
      createdBy: { id: users.id, name: users.name },
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.createdBy))
    .where(and(eq(orders.id, orderId), eq(orders.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!order) throw notFound("Order");

  const [items, movements] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        productId: orderItems.productId,
        productName: orderItems.productName,
        productSku: orderItems.productSku,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        lineTotal: orderItems.lineTotal,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.productName)),
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantityChange: stockMovements.quantityChange,
        productId: stockMovements.productId,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .where(and(eq(stockMovements.orderId, orderId), eq(stockMovements.workspaceId, actor.workspaceId)))
      .orderBy(asc(stockMovements.createdAt)),
  ]);

  return { ...order, items, movements };
}

export async function listOrders(actor: Actor, query: unknown) {
  requirePermission(actor, "order:read");
  const q = parse(orderListSchema, query);
  const where: SQL[] = [eq(orders.workspaceId, actor.workspaceId), ...createdWithin(orders.createdAt, q)];
  if (q.status) where.push(eq(orders.status, q.status));
  if (q.q) {
    const n = Number(q.q.replace(/^#/, ""));
    if (!Number.isInteger(n) || n <= 0) throw validationError("Some fields need attention", { q: "Search by order number, e.g. 1042" });
    where.push(eq(orders.number, n));
  }

  const db = getDb();
  const itemCount = db
    .select({ orderId: orderItems.orderId, lines: count().as("lines"), units: sql<number>`sum(${orderItems.quantity})::int`.as("units") })
    .from(orderItems)
    .groupBy(orderItems.orderId)
    .as("ic");

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        createdByName: users.name,
        lines: itemCount.lines,
        units: itemCount.units,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.createdBy))
      .leftJoin(itemCount, eq(itemCount.orderId, orders.id))
      .where(and(...where))
      .orderBy(desc(orders.createdAt), desc(orders.number))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(orders).where(and(...where)),
  ]);
  return { items: rows, page: q.page, pageSize: q.pageSize, total, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}
