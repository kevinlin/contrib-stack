import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { createDb } from "./client";
import { connections, dailyCounts, users } from "./schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupDb() {
  const db = createDb(":memory:");
  migrate(db, {
    migrationsFolder: path.join(__dirname, "../../drizzle"),
  });
  return db;
}

describe("schema", () => {
  it("round-trips user → connection → daily_counts upsert", () => {
    const db = setupDb();
    const userId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    db.insert(users)
      .values({
        id: userId,
        githubId: "12345",
        handle: "testuser",
        timezone: "UTC",
        isPrivate: false,
        createdAt,
      })
      .run();

    db.insert(connections)
      .values({
        id: connectionId,
        userId,
        slug: "github-personal",
        type: "github",
        label: "Personal",
        color: "#39d353",
        status: "ok",
        createdAt,
      })
      .run();

    db.insert(dailyCounts)
      .values({
        connectionId,
        date: "2025-01-15",
        count: 10,
      })
      .onConflictDoUpdate({
        target: [dailyCounts.connectionId, dailyCounts.date],
        set: { count: sql`excluded.count` },
      })
      .run();

    db.insert(dailyCounts)
      .values({
        connectionId,
        date: "2025-01-15",
        count: 25,
      })
      .onConflictDoUpdate({
        target: [dailyCounts.connectionId, dailyCounts.date],
        set: { count: sql`excluded.count` },
      })
      .run();

    const row = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .get();

    expect(row?.count).toBe(25);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    const connection = db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .get();

    expect(user?.handle).toBe("testuser");
    expect(connection?.slug).toBe("github-personal");
  });
});
