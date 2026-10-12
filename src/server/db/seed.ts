/**
 * Seeds SYNTHETIC demo data. Safe to re-run: it deletes and recreates only the demo
 * accounts (emails ending @demo.stockpilot.app) and the workspaces they own.
 * All stock changes go through the real services, so the ledger is consistent.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, inArray, like, sql } from "drizzle-orm";
import { authorize } from "../authz";
import { closeDb, getDb } from "./client";
import { DEMO_PASSWORD } from "./demo";
import { memberships, orders, stockMovements, users, workspaces } from "./schema";
import { adjustStock } from "../services/inventory";
import { createOrder, transitionOrder } from "../services/orders";
import { createProduct, type Product } from "../services/products";

const DEMO_DOMAIN = "@demo.stockpilot.app";

const CATALOGUE: [string, string, string, number, number, string?][] = [
  ["Ethiopia Yirgacheffe, 1kg", "GRN-ETH-1K", "24.50", 42, 10, "Washed, floral. Roasted to order."],
  ["Colombia Huila, 1kg", "GRN-COL-1K", "21.00", 36, 10],
  ["House Espresso Blend, 1kg", "GRN-HSE-1K", "18.75", 64, 15],
  ["Decaf Swiss Water, 500g", "GRN-DCF-500", "13.20", 7, 8],
  ["Stoneware Mug 12oz", "MUG-STN-12", "14.00", 58, 12],
  ["Oat Latte Mug", "MUG-OAT-10", "16.50", 22, 6],
  ["Ceramic Pour-over Dripper", "DRP-CER-02", "28.00", 15, 5],
  ["Gooseneck Kettle 1L", "KTL-GSN-1L", "64.00", 4, 4],
  ["V60 Paper Filters ×100", "FLT-V60-02", "6.90", 120, 30],
  ["Chemex Filters ×100", "FLT-CMX-100", "11.40", 0, 20],
  ["Hand Grinder, Steel Burr", "GRD-HND-01", "89.00", 9, 3],
  ["Barista Milk Pitcher 600ml", "PTC-MLK-600", "19.90", 18, 6],
  ["Kraft Retail Bag, large ×50", "BAG-KRF-L", "9.50", 210, 50],
  ["Assam Breakfast Tea ×50", "TEA-ASM-50", "12.00", 31, 10],
  ["Cold Brew Pitcher 1.5L", "CBR-PIT-15", "34.00", 11, 4],
  ["Digital Brew Scale", "SCL-DGT-01", "42.00", 6, 3],
];

async function main() {
  const db = getDb();

  // 1. remove previous demo data (workspaces owned by demo users, then the users)
  const old = await db.select({ id: users.id }).from(users).where(like(users.email, `%${DEMO_DOMAIN}`));
  if (old.length) {
    const oldIds = old.map((u) => u.id);
    const owned = await db.select({ ws: memberships.workspaceId }).from(memberships).where(inArray(memberships.userId, oldIds));
    const wsIds = [...new Set(owned.map((o) => o.ws))];
    if (wsIds.length) {
      await db.delete(stockMovements).where(inArray(stockMovements.workspaceId, wsIds));
      await db.delete(workspaces).where(inArray(workspaces.id, wsIds)); // cascades to products/orders/memberships
    }
    await db.delete(users).where(inArray(users.id, oldIds));
  }

  // 2. users
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [owner, staff, other] = await db
    .insert(users)
    .values([
      { email: `owner${DEMO_DOMAIN}`, name: "Maya Okafor", passwordHash },
      { email: `staff${DEMO_DOMAIN}`, name: "Dev Raman", passwordHash },
      { email: `harbor${DEMO_DOMAIN}`, name: "Lena Brandt", passwordHash },
    ])
    .returning();

  // 3. workspaces: Northside (owner + staff) and Harbor (other owner + Maya as staff)
  const [northside, harbor] = await db.insert(workspaces).values([{ name: "Northside Coffee Supply" }, { name: "Harbor Ceramics" }]).returning();
  await db.insert(memberships).values([
    { workspaceId: northside.id, userId: owner.id, role: "owner" },
    { workspaceId: northside.id, userId: staff.id, role: "staff" },
    { workspaceId: harbor.id, userId: other.id, role: "owner" },
    { workspaceId: harbor.id, userId: owner.id, role: "staff" },
  ]);

  const ownerActor = await authorize(owner.id, northside.id, "workspace:read");
  const staffActor = await authorize(staff.id, northside.id, "workspace:read");
  const harborActor = await authorize(other.id, harbor.id, "workspace:read");

  // 4. Plan the orders first (deterministic), so opening stock can be sized to land each
  //    product on its catalogue level without any after-the-fact "stocktake" corrections.
  let rng = 7;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  const plan: ("pending" | "confirmed" | "completed" | "cancelled")[] = [
    ...Array(13).fill("completed"),
    ...Array(6).fill("confirmed"),
    ...Array(5).fill("pending"),
    ...Array(4).fill("cancelled"),
  ];
  for (let i = plan.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [plan[i], plan[j]] = [plan[j], plan[i]];
  }
  const orderLines = plan.map(() => {
    const lines = new Map<number, number>();
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) lines.set(Math.floor(rand() * CATALOGUE.length), 1 + Math.floor(rand() * 3));
    return lines;
  });
  const consumed = new Array(CATALOGUE.length).fill(0);
  orderLines.forEach((lines, i) => {
    if (plan[i] !== "cancelled") for (const [idx, q] of lines) consumed[idx] += q;
  });
  const manual: Record<string, number> = { "MUG-STN-12": -2, "FLT-V60-02": 60, "TEA-ASM-50": -1 };

  const products: Product[] = [];
  for (const [idx, [name, sku, unitPrice, stock, threshold, description]] of CATALOGUE.entries())
    products.push(
      await createProduct(ownerActor, {
        name,
        sku,
        unitPrice,
        stockQuantity: stock + consumed[idx] - (manual[sku] ?? 0),
        lowStockThreshold: threshold,
        description,
      }),
    );
  for (const [name, sku, unitPrice, stock, threshold] of [
    ["Speckled Bowl", "BWL-SPK-01", "22.00", 30, 6],
    ["Stoneware Mug 12oz", "MUG-STN-12", "15.00", 12, 4], // same SKU as Northside: allowed
  ] as const)
    await createProduct(harborActor, { name, sku, unitPrice, stockQuantity: stock, lowStockThreshold: threshold });
  await db.execute(sql`update products set created_at = created_at - interval '45 days', updated_at = updated_at - interval '45 days' where workspace_id = ${northside.id}`);
  await db.execute(sql`update ${stockMovements} set created_at = created_at - interval '45 days' where workspace_id = ${northside.id}`);

  // 5. orders spread over the last ~6 weeks, created through the real service
  for (let i = 0; i < plan.length; i++) {
    const actor = i % 3 === 0 ? ownerActor : staffActor;
    const { order } = await createOrder(actor, { items: [...orderLines[i]].map(([idx, quantity]) => ({ productId: products[idx].id, quantity })) });
    const target = plan[i];
    if (target === "confirmed" || target === "completed") await transitionOrder(actor, order.id, { action: "confirm" });
    if (target === "completed") await transitionOrder(actor, order.id, { action: "complete" });
    if (target === "cancelled") await transitionOrder(ownerActor, order.id, { action: "cancel" });
    // Backdate for a realistic dashboard (later orders are more recent).
    const daysAgo = Math.max(0, Math.floor(((plan.length - i) / plan.length) * 40 + rand() * 2 - 1));
    const shift = sql`(${daysAgo} || ' days')::interval + (${Math.floor(rand() * 480)} || ' minutes')::interval`;
    await db.execute(sql`
      update ${orders} set
        created_at = created_at - ${shift},
        updated_at = updated_at - ${shift},
        confirmed_at = confirmed_at - ${shift} + interval '2 hours',
        completed_at = completed_at - ${shift} + interval '20 hours',
        cancelled_at = cancelled_at - ${shift} + interval '4 hours'
      where id = ${order.id}`);
    await db.execute(sql`update ${stockMovements} set created_at = created_at - ${shift} where order_id = ${order.id}`);
  }

  // 6. a few recent manual adjustments
  const bySku = (sku: string) => products.find((p) => p.sku === sku)!;
  await adjustStock(staffActor, bySku("MUG-STN-12").id, { type: "damaged", quantityChange: -2, note: "Chipped in transit" });
  await adjustStock(ownerActor, bySku("FLT-V60-02").id, { type: "received", quantityChange: 60, note: "PO-2219" });
  await adjustStock(staffActor, bySku("TEA-ASM-50").id, { type: "correction", quantityChange: -1, note: "Cycle count" });

  const count = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(eq(orders.workspaceId, northside.id));
  console.log(`[seed] demo ready: ${products.length} products, ${count[0].n} orders`);
  console.log(`[seed] owner${DEMO_DOMAIN} / staff${DEMO_DOMAIN}  password: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(closeDb);
