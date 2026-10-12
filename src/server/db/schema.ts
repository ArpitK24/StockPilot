import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Data model notes
 * - Every workspace-owned table carries `workspace_id`. Child rows reference their
 *   parent through a *composite* foreign key (workspace_id, parent_id), so the database
 *   itself guarantees that an order item or a stock movement can never point at a
 *   product or order from another workspace.
 * - Money is NUMERIC (exact decimal), never float.
 * - Stock invariants (non-negative) are CHECK constraints: the last line of defence
 *   behind the conditional UPDATEs in the service layer.
 * - All timestamps are timestamptz (stored as UTC instants).
 */

export const roleEnum = pgEnum("member_role", ["owner", "staff"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "completed", "cancelled"]);
export const movementTypeEnum = pgEnum("stock_movement_type", [
  // manual adjustments
  "received",
  "returned",
  "correction",
  "damaged",
  "lost",
  // system movements written by the order lifecycle
  "order_reserved",
  "order_released",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    // sha256 of the opaque cookie token; the raw token is never stored
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Per-workspace human-readable order numbers (#1001, #1002 ...). Incremented with
    // UPDATE ... RETURNING inside the order transaction, which serialises numbering.
    nextOrderNumber: integer("next_order_number").notNull().default(1001),
    ...timestamps,
  },
  (t) => [check("workspaces_name_len", sql`char_length(${t.name}) between 1 and 80`)],
);

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    description: text("description"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique("products_workspace_sku_uq").on(t.workspaceId, t.sku),
    // target for composite FKs from child tables
    unique("products_workspace_id_uq").on(t.workspaceId, t.id),
    index("products_workspace_name_idx").on(t.workspaceId, t.name),
    check("products_price_nonneg", sql`${t.unitPrice} >= 0`),
    check("products_stock_nonneg", sql`${t.stockQuantity} >= 0`),
    check("products_threshold_nonneg", sql`${t.lowStockThreshold} >= 0`),
    check("products_sku_len", sql`char_length(${t.sku}) between 1 and 64`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    // client-generated key so a retried "create order" request cannot create a duplicate
    idempotencyKey: text("idempotency_key"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("orders_workspace_number_uq").on(t.workspaceId, t.number),
    unique("orders_workspace_id_uq").on(t.workspaceId, t.id),
    unique("orders_workspace_idem_uq").on(t.workspaceId, t.idempotencyKey),
    index("orders_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("orders_workspace_status_idx").on(t.workspaceId, t.status),
    check("orders_total_nonneg", sql`${t.total} >= 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    orderId: uuid("order_id").notNull(),
    productId: uuid("product_id").notNull(),
    // immutable snapshots taken when the order was created
    productName: text("product_name").notNull(),
    productSku: text("product_sku").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "order_items_order_fk",
      columns: [t.workspaceId, t.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "order_items_product_fk",
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }),
    unique("order_items_order_product_uq").on(t.orderId, t.productId),
    check("order_items_qty_positive", sql`${t.quantity} > 0`),
    check("order_items_price_nonneg", sql`${t.unitPrice} >= 0`),
    check("order_items_line_total", sql`${t.lineTotal} = ${t.unitPrice} * ${t.quantity}`),
  ],
);

/**
 * Append-only stock ledger. Every change to products.stock_quantity, manual or caused by
 * an order, writes exactly one row here in the same transaction, together with the
 * quantity that resulted. Replaying the deltas reproduces current stock.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    productId: uuid("product_id").notNull(),
    type: movementTypeEnum("type").notNull(),
    quantityChange: integer("quantity_change").notNull(),
    resultingQuantity: integer("resulting_quantity").notNull(),
    note: text("note"),
    orderId: uuid("order_id"),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "stock_movements_product_fk",
      columns: [t.workspaceId, t.productId],
      foreignColumns: [products.workspaceId, products.id],
    }),
    foreignKey({
      name: "stock_movements_order_fk",
      columns: [t.workspaceId, t.orderId],
      foreignColumns: [orders.workspaceId, orders.id],
    }),
    index("stock_movements_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("stock_movements_product_idx").on(t.productId, t.createdAt),
    // At most one reservation and one release per (order, product). A database-level
    // guarantee that stock is never restored twice, even if application logic regressed.
    uniqueIndex("stock_movements_order_once_uq")
      .on(t.orderId, t.productId, t.type)
      .where(sql`${t.orderId} is not null`),
    check("stock_movements_nonzero", sql`${t.quantityChange} <> 0`),
    check("stock_movements_result_nonneg", sql`${t.resultingQuantity} >= 0`),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
export type MovementType = (typeof movementTypeEnum.enumValues)[number];
