import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { authorize, type Actor, type Permission } from "./authz";
import { AppError } from "./errors";
import { SESSION_COOKIE } from "./http/handler";
import { getUserBySessionToken } from "./services/auth";
import { isValidTimeZone } from "./validation/common";

/** Session user for server components; redirects to /login when signed out. */
export const requireUser = cache(async () => {
  const store = await cookies();
  const user = await getUserBySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return user;
});

export const getOptionalUser = cache(async () => {
  const store = await cookies();
  return getUserBySessionToken(store.get(SESSION_COOKIE)?.value);
});

/** Same membership + permission check the API uses. Non-members get a 404 page. */
export async function requireActor(workspaceId: string, permission: Permission): Promise<Actor & { user: Awaited<ReturnType<typeof requireUser>> }> {
  const user = await requireUser();
  try {
    const actor = await authorize(user.id, workspaceId, permission);
    return { ...actor, user };
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    if (err instanceof AppError && err.code === "FORBIDDEN") redirect(`/w/${workspaceId}?denied=1`);
    throw err;
  }
}

export async function viewerTimeZone() {
  const tz = decodeURIComponent((await cookies()).get("sp_tz")?.value ?? "UTC");
  return isValidTimeZone(tz) ? tz : "UTC";
}

/** Run a service call from a page; turn domain 404s into the not-found page. */
export async function load<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
}
