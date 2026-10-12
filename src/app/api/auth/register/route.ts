import { ok, publicRoute, readJson } from "@/server/http/handler";
import { setSessionCookie } from "@/server/http/cookies";
import { createSession, register } from "@/server/services/auth";

export const POST = publicRoute(async ({ req }) => {
  const { user, workspaceId } = await register(await readJson(req));
  const { token, expiresAt } = await createSession(user.id);
  const res = ok({ user, workspaceId }, 201);
  setSessionCookie(res, token, expiresAt);
  return res;
});
