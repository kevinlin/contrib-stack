import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
  throw new Error("DATABASE_PATH is required");
}

mkdirSync(path.dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath);

try {
  migrate(drizzle(sqlite), {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
} finally {
  sqlite.close();
}
