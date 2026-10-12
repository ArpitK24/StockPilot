import { ok, publicRoute, SESSION_COOKIE } from "@/server/http/handler";
import { clearSessionCookie } from "@/server/http/cookies";
import { deleteSession } from "@/server/services/auth";

export const POST = publicRoute(async ({ req }) => {
  await deleteSession(req.cookies.get(SESSION_COOKIE)?.value);
  const res = ok({ signedOut: true });
  clearSessionCookie(res);
  return res;
});
