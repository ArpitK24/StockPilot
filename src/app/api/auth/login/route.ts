import { ok, publicRoute, readJson } from "@/server/http/handler";
import { setSessionCookie } from "@/server/http/cookies";
import { createSession, verifyCredentials } from "@/server/services/auth";

export const POST = publicRoute(async ({ req }) => {
  const user = await verifyCredentials(await readJson(req));
  const { token, expiresAt } = await createSession(user.id);
  const res = ok({ user });
  setSessionCookie(res, token, expiresAt);
  return res;
});
