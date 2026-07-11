import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { connections, users } from "../db/schema";
import type { Db } from "../db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function setupTestDb(): {
  db: Db;
  userId: string;
  connectionId: string;
} {
  const sqlite = new Database(":memory:");
  const migrationSql = readFileSync(
    path.join(__dirname, "../../drizzle/0000_organic_deathstrike.sql"),
    "utf8",
  ).replace(/--> statement-breakpoint\n/g, "");
  sqlite.exec(migrationSql);

  const db = drizzle(sqlite, { schema });
  const userId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const createdAt = "2022-06-15T12:00:00.000Z";

  db.insert(users)
    .values({
      id: userId,
      githubId: "99999",
      handle: "sync-test-user",
      timezone: "America/New_York",
      isPrivate: false,
      createdAt,
    })
    .run();

  db.insert(connections)
    .values({
      id: connectionId,
      userId,
      slug: "github-test",
      type: "github",
      label: "Test",
      color: "#39d353",
      status: "ok",
      createdAt,
    })
    .run();

  return { db, userId, connectionId };
}

export async function waitForConnectionStatus(
  db: Db,
  connectionId: string,
  status: "ok" | "backfilling" | "error",
  timeoutMs = 5000,
) {
  const { eq } = await import("drizzle-orm");
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const connection = db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .get();

    if (connection?.status === status) {
      return connection;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const current = db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();

  throw new Error(
    `Timed out waiting for status '${status}', current: '${current?.status}'`,
  );
}
