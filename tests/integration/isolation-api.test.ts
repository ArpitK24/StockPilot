import { describe, expect, it } from "vitest";
import { authorize } from "@/server/authz";
import { adjustStock, listMovements } from "@/server/services/inventory";
import { createOrder, getOrder, listOrders, transitionOrder } from "@/server/services/orders";
import { getProduct, listProducts, updateProduct } from "@/server/services/products";
import { getDashboard } from "@/server/services/dashboard";
import * as productsRoute from "@/app/api/workspaces/[workspaceId]/products/route";
import * as productRoute from "@/app/api/workspaces/[workspaceId]/products/[productId]/route";
import * as ordersRoute from "@/app/api/workspaces/[workspaceId]/orders/route";
import * as transitionsRoute from "@/app/api/workspaces/[workspaceId]/orders/[orderId]/transitions/route";
import * as membersRoute from "@/app/api/workspaces/[workspaceId]/members/route";
import * as dashboardRoute from "@/app/api/workspaces/[workspaceId]/dashboard/route";
import * as registerRoute from "@/app/api/auth/register/route";
import * as loginRoute from "@/app/api/auth/login/route";
import { makeProduct, makeWorkspace, params, request, sessionCookieFor, stockOf, useCleanDatabase } from "../helpers";

useCleanDatabase();

async function twoWorkspaces() {
  const a = await makeWorkspace("Alpha");
  const b = await makeWorkspace("Bravo");
  const bProduct = await makeProduct(b.ownerActor, { stockQuantity: 10, unitPrice: "5.00" });
  const { order: bOrder } = await createOrder(b.ownerActor, { items: [{ productId: bProduct.id, quantity: 1 }] });
  return { a, b, bProduct, bOrder };
}

describe("workspace isolation (service layer)", () => {
  it("a non-member cannot resolve another workspace at all (404, not 403)", async () => {
    const { a, b } = await twoWorkspaces();
    await expect(authorize(a.owner.id, b.ws.id, "product:read")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(authorize(a.owner.id, "not-a-uuid", "product:read")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("IDs from another workspace are invisible and immutable from my workspace", async () => {
    const { a, bProduct, bOrder } = await twoWorkspaces();
    const me = a.ownerActor;
    await expect(getProduct(me, bProduct.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateProduct(me, bProduct.id, { unitPrice: "0.01" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adjustStock(me, bProduct.id, { type: "received", quantityChange: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getOrder(me, bOrder.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(transitionOrder(me, bOrder.id, { action: "cancel" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // ordering another workspace's product fails and leaves its stock alone
    await expect(createOrder(me, { items: [{ productId: bProduct.id, quantity: 1 }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await stockOf(bProduct.id)).toBe(9);
    // lists and metrics only ever contain my workspace's rows
    expect((await listProducts(me, {})).total).toBe(0);
    expect((await listOrders(me, {})).total).toBe(0);
    expect((await listMovements(me, { productId: bProduct.id })).total).toBe(0);
    const dash = await getDashboard(me, {});
    expect(dash.activeProducts).toBe(0);
    expect(dash.recentOrders).toHaveLength(0);
  });
});

describe("HTTP API: authentication, roles and isolation", () => {
  it("returns 401 without a session", async () => {
    const { b } = await twoWorkspaces();
    const res = await productsRoute.GET(request("GET", `/api/workspaces/${b.ws.id}/products`), params({ workspaceId: b.ws.id }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 404 when a signed-in user swaps in another workspace or product id", async () => {
    const { a, b, bProduct, bOrder } = await twoWorkspaces();
    const cookie = await sessionCookieFor(a.owner.id);

    const list = await productsRoute.GET(request("GET", `/api/workspaces/${b.ws.id}/products`, { cookie }), params({ workspaceId: b.ws.id }));
    expect(list.status).toBe(404);
    const body = await list.json();
    expect(JSON.stringify(body)).not.toContain(bProduct.sku);

    // my workspace id in the URL, their product id: still 404
    const one = await productRoute.GET(
      request("GET", `/api/workspaces/${a.ws.id}/products/${bProduct.id}`, { cookie }),
      params({ workspaceId: a.ws.id, productId: bProduct.id }),
    );
    expect(one.status).toBe(404);

    const cancel = await transitionsRoute.POST(
      request("POST", `/api/workspaces/${a.ws.id}/orders/${bOrder.id}/transitions`, { cookie, body: { action: "cancel" } }),
      params({ workspaceId: a.ws.id, orderId: bOrder.id }),
    );
    expect(cancel.status).toBe(404);

    const dash = await dashboardRoute.GET(request("GET", `/api/workspaces/${b.ws.id}/dashboard`, { cookie }), params({ workspaceId: b.ws.id }));
    expect(dash.status).toBe(404);
    const members = await membersRoute.GET(request("GET", `/api/workspaces/${b.ws.id}/members`, { cookie }), params({ workspaceId: b.ws.id }));
    expect(members.status).toBe(404);
  });

  it("enforces owner-only actions on the server for staff (403)", async () => {
    const { a } = await twoWorkspaces();
    const cookie = await sessionCookieFor(a.staff.id);
    const create = await productsRoute.POST(
      request("POST", `/api/workspaces/${a.ws.id}/products`, { cookie, body: { name: "X", sku: "X1", unitPrice: "1.00" } }),
      params({ workspaceId: a.ws.id }),
    );
    expect(create.status).toBe(403);
    const addMember = await membersRoute.POST(
      request("POST", `/api/workspaces/${a.ws.id}/members`, { cookie, body: { email: "x@example.test" } }),
      params({ workspaceId: a.ws.id }),
    );
    expect(addMember.status).toBe(403);
  });

  it("staff can create orders through the API; the response total is server-computed", async () => {
    const { a } = await twoWorkspaces();
    const p = await makeProduct(a.ownerActor, { unitPrice: "3.33", stockQuantity: 9 });
    const cookie = await sessionCookieFor(a.staff.id);
    const res = await ordersRoute.POST(
      request("POST", `/api/workspaces/${a.ws.id}/orders`, {
        cookie,
        body: { items: [{ productId: p.id, quantity: 3 }], total: "0.00" },
        headers: { "idempotency-key": "api-test-key-1" },
      }),
      params({ workspaceId: a.ws.id }),
    );
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.total).toBe("9.99");
  });

  it("returns 422 with field errors and blocks cross-origin writes", async () => {
    const { a } = await twoWorkspaces();
    const cookie = await sessionCookieFor(a.owner.id);
    const bad = await productsRoute.POST(
      request("POST", `/api/workspaces/${a.ws.id}/products`, { cookie, body: { name: "", sku: "", unitPrice: "abc" } }),
      params({ workspaceId: a.ws.id }),
    );
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.fields).toHaveProperty("unitPrice");

    const csrf = await productsRoute.POST(
      request("POST", `/api/workspaces/${a.ws.id}/products`, {
        cookie,
        body: { name: "A", sku: "A", unitPrice: "1" },
        headers: { origin: "https://evil.example" },
      }),
      params({ workspaceId: a.ws.id }),
    );
    expect(csrf.status).toBe(403);
  });

  it("register + login issue an httpOnly session cookie; wrong passwords get a generic 401", async () => {
    const reg = await registerRoute.POST(
      request("POST", "/api/auth/register", { body: { name: "Riya", email: "riya@example.test", password: "correct-horse", workspaceName: "Riya Goods" } }),
      params({}),
    );
    expect(reg.status).toBe(201);
    expect(reg.headers.get("set-cookie")).toMatch(/sp_session=.+HttpOnly/i);
    const dup = await registerRoute.POST(
      request("POST", "/api/auth/register", { body: { name: "Riya", email: "RIYA@example.test", password: "correct-horse", workspaceName: "X" } }),
      params({}),
    );
    expect(dup.status).toBe(409);
    const bad = await loginRoute.POST(request("POST", "/api/auth/login", { body: { email: "riya@example.test", password: "nope-nope" } }), params({}));
    expect(bad.status).toBe(401);
    const good = await loginRoute.POST(request("POST", "/api/auth/login", { body: { email: "riya@example.test", password: "correct-horse" } }), params({}));
    expect(good.status).toBe(200);
  });
});
