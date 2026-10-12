import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Actor } from "../authz";
import { dayRangeToInstants } from "@/lib/timezone";
import { getDb, type Tx } from "../db/client";
import { products, stockMovements, users, type MovementType } from "../db/schema";
import { AppError, notFound } from "../errors";
import { parse, uuidSchema, type DateRange } from "../validation/common";
import { adjustStockSchema, movementListSchema } from "../validation/schemas";
import { requirePermission } from "./products";

/** SQL predicate for a calendar-day range in the caller's time zone (see dateRangeSchema). */
export function createdWithin(column: SQL | AnyPgColumn, range: DateRange): SQL[] {
  const { start, end } = dayRangeToInstants(range);
  const out: SQL[] = [];
  if (start) out.push(sql`${column} >= ${start.toISOString()}::timestamptz`);
  if (end) out.push(sql`${column} < ${end.toISOString()}::timestamptz`);
  return out;
}

type StockChange = {
  workspaceId: string;
  productId: string;
  delta: number;
  type: MovementType;
  actorId: string;
  orderId?: string | null;
  note?: string | null;
  /** New orders may only reserve active products. */
  requireActive?: boolean;
};

/**
 * The one and only way stock changes. Must run inside a transaction.
 *
 * Concurrency: a single conditional UPDATE does the check and the write atomically.
 * Postgres row-locks the product; a concurrent transaction touching the same row waits,
 * then re-evaluates `stock_quantity + delta >= 0` against the *committed* value. Two
 * requests can therefore never both consume the last unit (no read-then-write race).
 * The CHECK (stock_quantity >= 0) constraint backs this up at the schema level.
 *
 * The ledger row is written in the same transaction, so stock and history cannot diverge.
 */
export async function applyStockChange(tx: Tx, change: StockChange) {
  const conditions: SQL[] = [
    eq(products.id, change.productId),
    eq(products.workspaceId, change.workspaceId),
    sql`${products.stockQuantity} + ${change.delta} >= 0`,
  ];
  if (change.requireActive) conditions.push(eq(products.isActive, true));

  const [updated] = await tx
    .update(products)
    .set({ stockQuantity: sql`${products.stockQuantity} + ${change.delta}`, updatedAt: sql`now()` })
    .where(and(...conditions))
    .returning({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
    });

  if (!updated) {
    // Work out *why* so the caller gets a precise error. Nothing has been written.
    const [p] = await tx
      .select({ name: products.name, sku: products.sku, stock: products.stockQuantity, isActive: products.isActive })
      .from(products)
      .where(and(eq(products.id, change.productId), eq(products.workspaceId, change.workspaceId)))
      .limit(1);
    if (!p) throw notFound("Product");
    if (change.requireActive && !p.isActive)
      throw new AppError("VALIDATION_ERROR", `${p.name} (${p.sku}) is inactive and cannot be ordered`, undefined, {
        productId: change.productId,
      });
    throw new AppError(
      "INSUFFICIENT_STOCK",
      change.delta < 0 && change.type === "order_reserved"
        ? `Not enough stock for ${p.name} (${p.sku}): ${p.stock} available, ${-change.delta} requested`
        : `This would take ${p.name} (${p.sku}) below zero: ${p.stock} on hand, change of ${change.delta}`,
      undefined,
      { productId: change.productId, available: p.stock, requested: -change.delta },
    );
  }

  const [movement] = await tx
    .insert(stockMovements)
    .values({
      workspaceId: change.workspaceId,
      productId: change.productId,
      type: change.type,
      quantityChange: change.delta,
      resultingQuantity: updated.stockQuantity,
      orderId: change.orderId ?? null,
      note: change.note ?? null,
      actorId: change.actorId,
    })
    .returning();

  return { product: updated, movement };
}

/** Manual stock adjustment (receiving, recount, damage...). */
export async function adjustStock(actor: Actor, productId: string, input: unknown) {
  requirePermission(actor, "inventory:adjust");
  if (!uuidSchema.safeParse(productId).success) throw notFound("Product");
  const data = parse(adjustStockSchema, input);
  return getDb().transaction((tx) =>
    applyStockChange(tx, {
      workspaceId: actor.workspaceId,
      productId,
      delta: data.quantityChange,
      type: data.type,
      actorId: actor.userId,
      note: data.note ?? null,
    }),
  );
}

export async function listMovements(actor: Actor, query: unknown) {
  requirePermission(actor, "inventory:read");
  const q = parse(movementListSchema, query);
  const where: SQL[] = [eq(stockMovements.workspaceId, actor.workspaceId), ...createdWithin(stockMovements.createdAt, q)];
  if (q.productId) where.push(eq(stockMovements.productId, q.productId));
  if (q.type) where.push(eq(stockMovements.type, q.type));

  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantityChange: stockMovements.quantityChange,
        resultingQuantity: stockMovements.resultingQuantity,
        note: stockMovements.note,
        orderId: stockMovements.orderId,
        createdAt: stockMovements.createdAt,
        productId: stockMovements.productId,
        productName: products.name,
        productSku: products.sku,
        actorName: users.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(users, eq(users.id, stockMovements.actorId))
      .where(and(...where))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(stockMovements).where(and(...where)),
  ]);
  return { items: rows, page: q.page, pageSize: q.pageSize, total, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}
