import { ok, readJson, workspaceRoute } from "@/server/http/handler";
import { searchParamsToObject } from "@/server/validation/common";
import { createProduct, listProducts } from "@/server/services/products";

export const GET = workspaceRoute("product:read", async ({ req, actor }) =>
  ok(await listProducts(actor, searchParamsToObject(req.nextUrl.searchParams))),
);
export const POST = workspaceRoute("product:write", async ({ req, actor }) => ok(await createProduct(actor, await readJson(req)), 201));
