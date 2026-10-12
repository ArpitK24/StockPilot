import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Actor } from "../authz";
import { getDb } from "../db/client";
import { memberships, users, workspaces } from "../db/schema";
import { AppError, conflict, notFound, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import { parse } from "../validation/common";
import { addMemberSchema, createWorkspaceSchema } from "../validation/schemas";
import { requirePermission } from "./products";

/** Workspaces the signed-in user belongs to (the only ones they can ever see). */
export async function listMyWorkspaces(userId: string) {
  const db = getDb();
  const memberCount = db
    .select({ workspaceId: memberships.workspaceId, n: count().as("n") })
    .from(memberships)
    .groupBy(memberships.workspaceId)
    .as("mc");
  return db
    .select({ id: workspaces.id, name: workspaces.name, role: memberships.role, members: memberCount.n })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .leftJoin(memberCount, eq(memberCount.workspaceId, workspaces.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.name));
}

export async function createWorkspace(userId: string, input: unknown) {
  const data = parse(createWorkspaceSchema, input);
  return getDb().transaction(async (tx) => {
    const [ws] = await tx.insert(workspaces).values({ name: data.name }).returning();
    await tx.insert(memberships).values({ workspaceId: ws.id, userId, role: "owner" });
    return ws;
  });
}

export async function getWorkspace(actor: Actor) {
  requirePermission(actor, "workspace:read");
  const [ws] = await getDb().select().from(workspaces).where(eq(workspaces.id, actor.workspaceId)).limit(1);
  if (!ws) throw notFound("Workspace");
  return { id: ws.id, name: ws.name, role: actor.role };
}

export async function listMembers(actor: Actor) {
  requirePermission(actor, "member:read");
  return getDb()
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, joinedAt: memberships.createdAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.workspaceId, actor.workspaceId))
    .orderBy(asc(memberships.createdAt));
}

/**
 * "Invitation" for this assessment: an Owner adds an already-registered user by email.
 * The new member signs in with their own credentials and sees the workspace.
 */
export async function addMember(actor: Actor, input: unknown) {
  requirePermission(actor, "member:manage");
  const data = parse(addMemberSchema, input);
  const [user] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email}`)
    .limit(1);
  if (!user)
    throw new AppError("VALIDATION_ERROR", "No StockPilot account uses that email yet", {
      email: "Ask them to register first, then add them here",
    });
  try {
    await getDb().insert(memberships).values({ workspaceId: actor.workspaceId, userId: user.id, role: data.role });
  } catch (err) {
    if (pgCode(err) === PG_UNIQUE_VIOLATION) throw conflict("That person is already a member", { email: "Already a member" });
    throw err;
  }
  return { userId: user.id, name: user.name, email: user.email, role: data.role };
}

export async function removeMember(actor: Actor, userId: string) {
  requirePermission(actor, "member:manage");
  return getDb().transaction(async (tx) => {
    // Lock the workspace's memberships so two concurrent removals can't leave zero owners.
    const rows = await tx
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.workspaceId, actor.workspaceId))
      .for("update");
    const target = rows.find((r) => r.userId === userId);
    if (!target) throw notFound("Member");
    if (target.role === "owner" && rows.filter((r) => r.role === "owner").length === 1)
      throw conflict("A workspace needs at least one owner");
    await tx.delete(memberships).where(and(eq(memberships.workspaceId, actor.workspaceId), eq(memberships.userId, userId)));
    return { removed: userId };
  });
}
