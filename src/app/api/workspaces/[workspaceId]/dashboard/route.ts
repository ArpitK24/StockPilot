import { ok, workspaceRoute } from "@/server/http/handler";
import { searchParamsToObject } from "@/server/validation/common";
import { getDashboard } from "@/server/services/dashboard";

export const GET = workspaceRoute("dashboard:read", async ({ req, actor }) =>
  ok(await getDashboard(actor, searchParamsToObject(req.nextUrl.searchParams))),
);
