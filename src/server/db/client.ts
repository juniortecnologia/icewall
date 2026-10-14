import "server-only";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { envPath } from "../lib/paths";
import * as schema from "./schema";
import { ensureServerSeed } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;

const g = globalThis as unknown as { __icewallDb?: DB };

function open(): DB {
  const file = envPath("ICEWALL_DB", path.join(process.cwd(), "data", "icewall.db"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  // Seed idempotente do registro central de servidores (Station + Spark).
  ensureServerSeed(db);
  return db;
}

/** Conexão única por processo (sobrevive ao HMR do next dev). */
export function getDb(): DB {
  g.__icewallDb ??= open();
  return g.__icewallDb;
}

export { schema };
