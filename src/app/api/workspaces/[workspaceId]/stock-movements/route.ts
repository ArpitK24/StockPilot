import { ok, workspaceRoute } from "@/server/http/handler";
import { searchParamsToObject } from "@/server/validation/common";
import { listMovements } from "@/server/services/inventory";

export const GET = workspaceRoute("inventory:read", async ({ req, actor }) =>
  ok(await listMovements(actor, searchParamsToObject(req.nextUrl.searchParams))),
);
