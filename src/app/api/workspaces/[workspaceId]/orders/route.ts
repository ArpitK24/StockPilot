import { ok, readJson, workspaceRoute } from "@/server/http/handler";
import { searchParamsToObject } from "@/server/validation/common";
import { createOrder, listOrders } from "@/server/services/orders";

export const GET = workspaceRoute("order:read", async ({ req, actor }) =>
  ok(await listOrders(actor, searchParamsToObject(req.nextUrl.searchParams))),
);
export const POST = workspaceRoute("order:create", async ({ req, actor }) => {
  const { order, replayed } = await createOrder(actor, await readJson(req), req.headers.get("idempotency-key"));
  return ok(order, replayed ? 200 : 201, replayed ? { "idempotent-replayed": "true" } : undefined);
});
