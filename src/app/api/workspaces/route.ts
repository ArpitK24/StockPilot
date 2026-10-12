import { authedRoute, ok, readJson } from "@/server/http/handler";
import { createWorkspace, listMyWorkspaces } from "@/server/services/workspaces";

export const GET = authedRoute(async ({ user }) => ok(await listMyWorkspaces(user.id)));
export const POST = authedRoute(async ({ req, user }) => ok(await createWorkspace(user.id, await readJson(req)), 201));
