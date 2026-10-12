import { ok, workspaceRoute } from "@/server/http/handler";
import { getWorkspace } from "@/server/services/workspaces";

export const GET = workspaceRoute("workspace:read", async ({ actor }) => ok(await getWorkspace(actor)));
