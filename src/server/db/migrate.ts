import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "./client";

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: path.join(process.cwd(), "drizzle") });
}

if (require.main === module) {
  runMigrations()
    .then(() => console.log("[migrate] database is up to date"))
    .catch((err) => {
      console.error("[migrate] failed:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(closeDb);
}
