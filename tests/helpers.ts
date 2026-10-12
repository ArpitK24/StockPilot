import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { afterAll, beforeEach } from "vitest";
import { authorize, type Actor } from "@/server/authz";
import { closeDb, getDb } from "@/server/db/client";
import { memberships, products, users, workspaces } from "@/server/db/schema";
import { createSession } from "@/server/services/auth";
import { createProduct } from "@/server/services/products";

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export function useCleanDatabase() {
  beforeEach(async () => {
    await getDb().execute(
      sql`truncate table stock_movements, order_items, orders, products, memberships, sessions, workspaces, users restart identity cascade`,
    );
  });
  afterAll(async () => {
    await closeDb();
  });
}

export async function makeUser(name = "Test User") {
  const [u] = await getDb()
    .insert(users)
    .values({ email: `${uniq()}@example.test`, name, passwordHash: "x" })
    .returning();
  return u;
}

/** A workspace with an owner and a staff member, returning ready-made actors. */
export async function makeWorkspace(name = "Acme") {
  const db = getDb();
  const [ws] = await db.insert(workspaces).values({ name }).returning();
  const owner = await makeUser(`${name} Owner`);
  const staff = await makeUser(`${name} Staff`);
  await db.insert(memberships).values([
    { workspaceId: ws.id, userId: owner.id, role: "owner" },
    { workspaceId: ws.id, userId: staff.id, role: "staff" },
  ]);
  const ownerActor: Actor = await authorize(owner.id, ws.id, "workspace:read");
  const staffActor: Actor = await authorize(staff.id, ws.id, "workspace:read");
  return { ws, owner, staff, ownerActor, staffActor };
}

export async function makeProduct(actor: Actor, overrides: Partial<{ name: string; sku: string; unitPrice: string; stockQuantity: number; lowStockThreshold: number }> = {}) {
  return createProduct(actor, {
    name: overrides.name ?? `Widget ${uniq()}`,
    sku: overrides.sku ?? `SKU-${uniq()}`,
    unitPrice: overrides.unitPrice ?? "10.00",
    stockQuantity: overrides.stockQuantity ?? 10,
    lowStockThreshold: overrides.lowStockThreshold ?? 2,
  });
}

export async function stockOf(productId: string) {
  const [row] = await getDb().select({ s: products.stockQuantity }).from(products).where(sql`${products.id} = ${productId}`);
  return row.s;
}

export async function count(table: string) {
  const res = await getDb().execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${table}`));
  return Number(res.rows[0].n);
}

/** Build a NextRequest carrying a real session cookie, for calling route handlers directly. */
export async function sessionCookieFor(userId: string) {
  const { token } = await createSession(userId);
  return `sp_session=${token}`;
}

export function request(method: string, path: string, opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
