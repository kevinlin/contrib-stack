import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export function createDb(path?: string) {
  const databasePath = path ?? process.env.DATABASE_PATH ?? ":memory:";
  const sqlite = new Database(databasePath);
  return drizzle(sqlite, { schema });
}

export type Db = ReturnType<typeof createDb>;

let dbInstance: Db | null = null;

export function getDb(): Db {
  if (!dbInstance) {
    dbInstance = createDb();
  }
  return dbInstance;
}
