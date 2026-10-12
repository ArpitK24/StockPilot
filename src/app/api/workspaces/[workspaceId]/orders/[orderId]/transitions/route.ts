import { ok, readJson, workspaceRoute } from "@/server/http/handler";
import { transitionOrder } from "@/server/services/orders";

export const POST = workspaceRoute<{ workspaceId: string; orderId: string }>("order:transition", async ({ req, actor, params }) =>
  ok(await transitionOrder(actor, params.orderId, await readJson(req))),
);
