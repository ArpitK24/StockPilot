import { authedRoute, ok } from "@/server/http/handler";
import { listMyWorkspaces } from "@/server/services/workspaces";

export const GET = authedRoute(async ({ user }) => ok({ user, workspaces: await listMyWorkspaces(user.id) }));
