import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorize, type Actor, type Permission } from "../authz";
import { AppError, forbidden, unauthenticated, validationError } from "../errors";
import { logger } from "../logger";
import { getUserBySessionToken, type SessionUser } from "../services/auth";

export const SESSION_COOKIE = "sp_session";

type RouteParams = Record<string, string>;
type Ctx<P extends RouteParams> = { req: NextRequest; params: P; requestId: string };
type AuthedCtx<P extends RouteParams> = Ctx<P> & { user: SessionUser };
type WorkspaceCtx<P extends RouteParams> = AuthedCtx<P> & { actor: Actor };

export function ok(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json({ data }, { status, headers });
}

function errorResponse(err: unknown, requestId: string) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, fields: err.fields, details: err.details } },
      { status: err.status, headers: { "x-request-id": requestId } },
    );
  }
  // Unexpected: log full detail server-side, return a generic message.
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong. Please try again.", requestId } },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

/** Rejects cross-site state-changing requests (defence in depth alongside SameSite=Lax cookies). */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, tests) don't send Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw forbidden("Cross-origin request blocked");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw forbidden("Cross-origin request blocked");
  }
}

export async function readJson(req: NextRequest): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw validationError("Send a JSON body (Content-Type: application/json)");
  try {
    return await req.json();
  } catch {
    throw validationError("Request body is not valid JSON");
  }
}

function wrap<P extends RouteParams>(fn: (ctx: Ctx<P>) => Promise<Response>) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const started = Date.now();
    let status = 500;
    try {
      assertSameOrigin(req);
      const params = ((await context?.params) ?? {}) as P;
      const res = await fn({ req, params, requestId });
      status = res.status;
      res.headers.set("x-request-id", requestId);
      return res;
    } catch (err) {
      const res = errorResponse(err, requestId);
      status = res.status;
      if (!(err instanceof AppError)) logger.error("unhandled_error", { requestId, path: req.nextUrl.pathname, err });
      return res;
    } finally {
      logger.info("request", { requestId, method: req.method, path: req.nextUrl.pathname, status, ms: Date.now() - started });
    }
  };
}

/** Public route (login, register, health). */
export const publicRoute = <P extends RouteParams = RouteParams>(fn: (ctx: Ctx<P>) => Promise<Response>) => wrap(fn);

/** Requires a valid session. Identity comes from the session cookie only. */
export function authedRoute<P extends RouteParams = RouteParams>(fn: (ctx: AuthedCtx<P>) => Promise<Response>) {
  return wrap<P>(async (ctx) => {
    const user = await getUserBySessionToken(ctx.req.cookies.get(SESSION_COOKIE)?.value);
    if (!user) throw unauthenticated();
    return fn({ ...ctx, user });
  });
}

/**
 * Requires a session AND membership of params.workspaceId with `permission`.
 * The handler receives an Actor whose workspaceId has been verified; services scope
 * every query by it.
 */
export function workspaceRoute<P extends RouteParams & { workspaceId: string }>(
  permission: Permission,
  fn: (ctx: WorkspaceCtx<P>) => Promise<Response>,
) {
  return authedRoute<P>(async (ctx) => {
    const actor = await authorize(ctx.user.id, ctx.params.workspaceId, permission);
    return fn({ ...ctx, actor });
  });
}
