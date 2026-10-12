import { ok, readJson, workspaceRoute } from "@/server/http/handler";
import { getProduct, updateProduct } from "@/server/services/products";

type P = { workspaceId: string; productId: string };
export const GET = workspaceRoute<P>("product:read", async ({ actor, params }) => ok(await getProduct(actor, params.productId)));
export const PATCH = workspaceRoute<P>("product:write", async ({ req, actor, params }) =>
  ok(await updateProduct(actor, params.productId, await readJson(req))),
);
