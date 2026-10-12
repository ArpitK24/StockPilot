import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;
/** A database handle or an open transaction: services accept either. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

declare global {
  // eslint-disable-next-line no-var
  var __stockpilotPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const needsSsl = /sslmode=require/.test(connectionString) || /neon\.tech/.test(connectionString);
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
    idleTimeoutMillis: 10_000,
  });
}

/** One pool per process (reused across hot reloads in dev and warm serverless invocations). */
export function getPool(): Pool {
  if (!globalThis.__stockpilotPool) globalThis.__stockpilotPool = createPool();
  return globalThis.__stockpilotPool;
}

let _db: DB | undefined;
export function getDb(): DB {
  if (!_db) _db = drizzle(getPool(), { schema });
  return _db;
}

export async function closeDb() {
  if (globalThis.__stockpilotPool) {
    await globalThis.__stockpilotPool.end();
    globalThis.__stockpilotPool = undefined;
    _db = undefined;
  }
}
