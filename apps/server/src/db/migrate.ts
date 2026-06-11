import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./index";

/**
 * Run committed migrations at boot (TD-4: automatic, fail-fast). The folder
 * resolves from the server package's working directory — `pnpm dev`, `pnpm
 * start`, and the container all run with apps/server as cwd.
 */
export function runMigrations(db: Db, migrationsFolder = path.resolve("drizzle")): void {
  migrate(db, { migrationsFolder });
}
