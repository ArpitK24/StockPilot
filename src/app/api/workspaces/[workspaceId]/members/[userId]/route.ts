import { ok, workspaceRoute } from "@/server/http/handler";
import { removeMember } from "@/server/services/workspaces";

export const DELETE = workspaceRoute<{ workspaceId: string; userId: string }>("member:manage", async ({ actor, params }) =>
  ok(await removeMember(actor, params.userId)),
);
