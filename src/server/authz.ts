import { and, eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { memberships, type Role } from "./db/schema";
import { forbidden, notFound } from "./errors";
import { uuidSchema } from "./validation/common";

/**
 * Role -> permission matrix. This is the single source of truth: API routes and pages
 * call `authorize(...)` with one of these permissions, and the UI only *mirrors* it to
 * hide controls. Hiding a button is never the enforcement.
 */
export const PERMISSIONS = {
  "workspace:read": ["owner", "staff"],
  "dashboard:read": ["owner", "staff"],
  "product:read": ["owner", "staff"],
  "product:write": ["owner"], // create, edit, change price, deactivate
  "inventory:read": ["owner", "staff"],
  "inventory:adjust": ["owner", "staff"],
  "order:read": ["owner", "staff"],
  "order:create": ["owner", "staff"],
  "order:transition": ["owner", "staff"], // confirm, complete, cancel
  "member:read": ["owner", "staff"],
  "member:manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Who is acting, in which workspace, with which role. Passed into every service call. */
export type Actor = { userId: string; workspaceId: string; role: Role };

/**
 * Resolves the caller's membership in a workspace and checks a permission.
 * - userId always comes from the verified session, never from the request.
 * - A workspace the user is not a member of is reported as 404, not 403, so the
 *   response does not even confirm that the workspace exists.
 * - A member lacking the permission gets 403.
 */
export async function authorize(userId: string, workspaceId: string, permission: Permission): Promise<Actor> {
  if (!uuidSchema.safeParse(workspaceId).success) throw notFound("Workspace");
  const [m] = await getDb()
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  if (!m) throw notFound("Workspace");
  if (!can(m.role, permission)) throw forbidden();
  return { userId, workspaceId, role: m.role };
}
