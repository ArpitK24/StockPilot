import { ok, readJson, workspaceRoute } from "@/server/http/handler";
import { adjustStock } from "@/server/services/inventory";

type P = { workspaceId: string; productId: string };
export const POST = workspaceRoute<P>("inventory:adjust", async ({ req, actor, params }) =>
  ok(await adjustStock(actor, params.productId, await readJson(req)), 201),
);
