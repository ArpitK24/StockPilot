import { ok, workspaceRoute } from "@/server/http/handler";
import { getOrder } from "@/server/services/orders";

export const GET = workspaceRoute<{ workspaceId: string; orderId: string }>("order:read", async ({ actor, params }) =>
  ok(await getOrder(actor, params.orderId)),
);
