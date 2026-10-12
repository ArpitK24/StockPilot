import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { memberships, sessions, users, workspaces } from "../db/schema";
import { AppError, conflict, pgCode, PG_UNIQUE_VIOLATION } from "../errors";
import { parse } from "../validation/common";
import { loginSchema, registerSchema } from "../validation/schemas";

export const SESSION_TTL_DAYS = 30;
const BCRYPT_COST = 10;
// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.0b8V2jZ8yZp3uZ2z7Q2mXo5h6m2e";

export type SessionUser = { id: string; email: string; name: string };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function register(input: unknown) {
  const data = parse(registerSchema, input);
  const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST);
  try {
    return await getDb().transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: data.email, name: data.name, passwordHash })
        .returning({ id: users.id, email: users.email, name: users.name });
      const [ws] = await tx.insert(workspaces).values({ name: data.workspaceName }).returning({ id: workspaces.id });
      await tx.insert(memberships).values({ workspaceId: ws.id, userId: user.id, role: "owner" });
      return { user, workspaceId: ws.id };
    });
  } catch (err) {
    if (pgCode(err) === PG_UNIQUE_VIOLATION)
      throw conflict("An account with this email already exists", { email: "This email is already registered" });
    throw err;
  }
}

export async function verifyCredentials(input: unknown): Promise<SessionUser> {
  const data = parse(loginSchema, input);
  const [user] = await getDb()
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${data.email}`)
    .limit(1);
  const ok = await bcrypt.compare(data.password, user?.passwordHash ?? DUMMY_HASH);
  // Same message for unknown email and wrong password: no account enumeration.
  if (!user || !ok) throw new AppError("UNAUTHENTICATED", "Email or password is incorrect");
  return { id: user.id, email: user.email, name: user.name };
}

/** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  await getDb().insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const [row] = await getDb()
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function deleteSession(token: string | undefined | null) {
  if (!token) return;
  await getDb().delete(sessions).where(eq(sessions.id, hashToken(token)));
}
