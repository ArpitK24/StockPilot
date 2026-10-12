import { ok, workspaceRoute } from "@/server/http/handler";
import { searchOrderableProducts } from "@/server/services/products";

export const GET = workspaceRoute("order:create", async ({ req, actor }) =>
  ok(await searchOrderableProducts(actor, req.nextUrl.searchParams.get("q") ?? undefined)),
);
