import { and, asc, count, desc, eq, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { can, type Actor, type Permission } from "../authz";
import { getDb } from "../db/client";
import { products, stockMovements } from "../db/schema";
import { conflict, forbidden, notFound, pgCode, pgConstraint, PG_UNIQUE_VIOLATION } from "../errors";
import { parse, uuidSchema } from "../validation/common";
import { createProductSchema, productListSchema, updateProductSchema } from "../validation/schemas";

export function requirePermission(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) throw forbidden();
}

export type Product = typeof products.$inferSelect;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function skuConflict(err: unknown): never {
  if (pgCode(err) === PG_UNIQUE_VIOLATION && pgConstraint(err) === "products_workspace_sku_uq")
    throw conflict("A product with this SKU already exists in this workspace", {
      sku: "This SKU is already used in this workspace",
    });
  throw err;
}

export async function listProducts(actor: Actor, query: unknown) {
  requirePermission(actor, "product:read");
  const q = parse(productListSchema, query);

  const where: SQL[] = [eq(products.workspaceId, actor.workspaceId)];
  if (q.status === "active") where.push(eq(products.isActive, true));
  if (q.status === "inactive") where.push(eq(products.isActive, false));
  if (q.stock === "low") where.push(lte(products.stockQuantity, products.lowStockThreshold));
  if (q.stock === "out") where.push(eq(products.stockQuantity, 0));
  if (q.q) {
    const term = `%${escapeLike(q.q)}%`;
    where.push(or(ilike(products.name, term), ilike(products.sku, term))!);
  }

  const sortCol = {
    name: products.name,
    sku: products.sku,
    stock: products.stockQuantity,
    price: products.unitPrice,
    updated: products.updatedAt,
  }[q.sort];
  const order = q.dir === "asc" ? asc(sortCol) : desc(sortCol);

  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(and(...where))
      .orderBy(order, asc(products.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ total: count() }).from(products).where(and(...where)),
  ]);
  return { items: rows, page: q.page, pageSize: q.pageSize, total, pageCount: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export async function getProduct(actor: Actor, productId: string): Promise<Product> {
  requirePermission(actor, "product:read");
  if (!uuidSchema.safeParse(productId).success) throw notFound("Product");
  const [row] = await getDb()
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.workspaceId, actor.workspaceId)))
    .limit(1);
  if (!row) throw notFound("Product");
  return row;
}

/** Products available to put on a new order (active only), for the order builder. */
export async function searchOrderableProducts(actor: Actor, term: string | undefined, limit = 20) {
  requirePermission(actor, "order:create");
  const where: SQL[] = [eq(products.workspaceId, actor.workspaceId), eq(products.isActive, true)];
  if (term?.trim()) {
    const t = `%${escapeLike(term.trim().slice(0, 120))}%`;
    where.push(or(ilike(products.name, t), ilike(products.sku, t))!);
  }
  return getDb()
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      unitPrice: products.unitPrice,
      stockQuantity: products.stockQuantity,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .where(and(...where))
    .orderBy(asc(products.name))
    .limit(Math.min(Math.max(limit, 1), 50));
}

/**
 * Creates a product. Opening stock (if any) is written as a "received" movement in the
 * same transaction, so the ledger explains every unit from day one.
 */
export async function createProduct(actor: Actor, input: unknown): Promise<Product> {
  requirePermission(actor, "product:write");
  const data = parse(createProductSchema, input);
  try {
    return await getDb().transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          workspaceId: actor.workspaceId,
          name: data.name,
          sku: data.sku,
          description: data.description,
          unitPrice: data.unitPrice,
          stockQuantity: data.stockQuantity,
          lowStockThreshold: data.lowStockThreshold,
        })
        .returning();
      if (data.stockQuantity > 0) {
        await tx.insert(stockMovements).values({
          workspaceId: actor.workspaceId,
          productId: product.id,
          type: "received",
          quantityChange: data.stockQuantity,
          resultingQuantity: data.stockQuantity,
          note: "Opening stock",
          actorId: actor.userId,
        });
      }
      return product;
    });
  } catch (err) {
    skuConflict(err);
  }
}

/** Edits catalogue fields. Stock is not editable here; it only changes via movements. */
export async function updateProduct(actor: Actor, productId: string, input: unknown): Promise<Product> {
  requirePermission(actor, "product:write");
  if (!uuidSchema.safeParse(productId).success) throw notFound("Product");
  const data = parse(updateProductSchema, input);
  try {
    const [row] = await getDb()
      .update(products)
      .set({ ...data, updatedAt: sql`now()` })
      .where(and(eq(products.id, productId), eq(products.workspaceId, actor.workspaceId)))
      .returning();
    if (!row) throw notFound("Product");
    return row;
  } catch (err) {
    skuConflict(err);
  }
}

export async function setProductActive(actor: Actor, productId: string, isActive: boolean) {
  return updateProduct(actor, productId, { isActive });
}
