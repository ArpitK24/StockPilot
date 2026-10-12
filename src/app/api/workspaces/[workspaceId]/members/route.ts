import { ok, readJson, workspaceRoute } from "@/server/http/handler";
import { addMember, listMembers } from "@/server/services/workspaces";

export const GET = workspaceRoute("member:read", async ({ actor }) => ok(await listMembers(actor)));
export const POST = workspaceRoute("member:manage", async ({ req, actor }) => ok(await addMember(actor, await readJson(req)), 201));
