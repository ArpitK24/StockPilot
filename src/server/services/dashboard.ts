import { and, count, desc, eq, lte, sql } from "drizzle-orm";
import type { Actor } from "../authz";
import { getDb } from "../db/client";
import { orders, products, stockMovements, users, type OrderStatus } from "../db/schema";
import { parse } from "../validation/common";
import { dashboardSchema } from "../validation/schemas";
import { createdWithin } from "./inventory";
import { requirePermission } from "./products";

/**
 * METRIC DEFINITIONS (shared by the API and the UI; see README "Dashboard metrics")
 * - activeProducts : products with is_active = true.
 * - lowStock       : ACTIVE products with stock_quantity <= low_stock_threshold
 *                    (includes out-of-stock). Point-in-time, ignores the date range.
 * - ordersByStatus : orders CREATED in the range, grouped by current status.
 * - bookedValue    : sum of totals of orders created in the range whose status is
 *                    pending, confirmed or completed. Cancelled orders are excluded.
 * - completedValue : the subset of bookedValue whose status is completed.
 * - range          : calendar days in the viewer's time zone, both ends inclusive.
 *                    Default is the last 30 days including today.
 */
export const DEFAULT_RANGE_DAYS = 30;

export function todayIn(tz: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getDashboard(actor: Actor, query: unknown) {
  requirePermission(actor, "dashboard:read");
  const parsed = parse(dashboardSchema, query);
  const to = parsed.to ?? todayIn(parsed.tz);
  const from = parsed.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
  const range = { from, to, tz: parsed.tz };
  const ws = actor.workspaceId;
  const db = getDb();
  const inRange = and(eq(orders.workspaceId, ws), ...createdWithin(orders.createdAt, range));

  const [productStats, statusRows, valueRow, series, recentOrders, recentMovements] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) filter (where ${products.isActive})::int`,
        lowStock: sql<number>`count(*) filter (where ${products.isActive} and ${products.stockQuantity} <= ${products.lowStockThreshold})::int`,
        outOfStock: sql<number>`count(*) filter (where ${products.isActive} and ${products.stockQuantity} = 0)::int`,
      })
      .from(products)
      .where(eq(products.workspaceId, ws)),
    db.select({ status: orders.status, n: count() }).from(orders).where(inRange).groupBy(orders.status),
    db
      .select({
        booked: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.status} <> 'cancelled'), 0)::numeric(14,2)::text`,
        completed: sql<string>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::numeric(14,2)::text`,
      })
      .from(orders)
      .where(inRange),
    // booked value per day, zero-filled, in the viewer's time zone
    db.execute<{ day: string; value: string; orders: number }>(sql`
      with days as (
        select generate_series(${from}::date, ${to}::date, interval '1 day')::date as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as day,
             coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0)::numeric(14,2)::text as value,
             count(o.id) filter (where o.status <> 'cancelled')::int as orders
      from days d
      left join ${orders} o
        on o.workspace_id = ${ws}
       and o.created_at >= d.day::timestamp at time zone ${range.tz}
       and o.created_at < (d.day + 1)::timestamp at time zone ${range.tz}
      group by d.day
      order by d.day`),
    db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
        createdByName: users.name,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.createdBy))
      .where(eq(orders.workspaceId, ws))
      .orderBy(desc(orders.createdAt))
      .limit(6),
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantityChange: stockMovements.quantityChange,
        resultingQuantity: stockMovements.resultingQuantity,
        createdAt: stockMovements.createdAt,
        productId: stockMovements.productId,
        productName: products.name,
        productSku: products.sku,
        actorName: users.name,
      })
      .from(stockMovements)
      .innerJoin(products, eq(products.id, stockMovements.productId))
      .innerJoin(users, eq(users.id, stockMovements.actorId))
      .where(eq(stockMovements.workspaceId, ws))
      .orderBy(desc(stockMovements.createdAt))
      .limit(8),
  ]);

  const ordersByStatus: Record<OrderStatus, number> = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
  for (const r of statusRows) ordersByStatus[r.status] = r.n;

  const lowStockItems = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      stockQuantity: products.stockQuantity,
      lowStockThreshold: products.lowStockThreshold,
    })
    .from(products)
    .where(and(eq(products.workspaceId, ws), eq(products.isActive, true), lte(products.stockQuantity, products.lowStockThreshold)))
    .orderBy(products.stockQuantity, products.name)
    .limit(5);

  return {
    range,
    activeProducts: productStats[0]?.active ?? 0,
    lowStock: productStats[0]?.lowStock ?? 0,
    outOfStock: productStats[0]?.outOfStock ?? 0,
    ordersByStatus,
    bookedValue: valueRow[0]?.booked ?? "0.00",
    completedValue: valueRow[0]?.completed ?? "0.00",
    series: series.rows.map((r) => ({ day: r.day, value: r.value, orders: Number(r.orders) })),
    recentOrders,
    recentMovements,
    lowStockItems,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
