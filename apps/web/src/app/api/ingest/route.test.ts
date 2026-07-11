import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { connections, dailyCounts, users } from "@/db/schema";
import type { Db } from "@/db/client";
import { hashApiKey } from "@/lib/crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = "csk_testkey123456789012345678901234";
const API_KEY_HASH = hashApiKey(API_KEY);

function setupTestDb(): Db {
  const sqlite = new Database(":memory:");
  const migrationSql = readFileSync(
    path.join(__dirname, "../../../../drizzle/0000_organic_deathstrike.sql"),
    "utf8",
  ).replace(/--> statement-breakpoint\n/g, "");
  sqlite.exec(migrationSql);
  return drizzle(sqlite, { schema });
}

function seedIngestConnection(db: Db) {
  const userId = "user-1";
  const connectionId = "conn-ingest";

  db.insert(users)
    .values({
      id: userId,
      githubId: "999",
      handle: "testuser",
      timezone: "UTC",
      isPrivate: false,
      createdAt: new Date().toISOString(),
    })
    .run();

  db.insert(connections)
    .values({
      id: connectionId,
      userId,
      slug: "my-ingest",
      type: "ingest",
      label: "My Ingest",
      color: "#ff6b00",
      apiKeyHash: API_KEY_HASH,
      status: "ok",
      createdAt: new Date().toISOString(),
    })
    .run();

  db.insert(dailyCounts)
    .values({ connectionId, date: "2026-07-01", count: 5 })
    .run();

  return { connectionId };
}

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { getDb } from "@/db/client";
import {
  createRateLimiter,
  resetIngestRateLimiterForTests,
  setIngestRateLimiterForTests,
} from "@/lib/rate-limit";
import { POST } from "./route";

async function postIngest(
  body: unknown,
  authHeader?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader !== undefined) {
    headers.Authorization = authHeader;
  }

  return POST(
    new Request("http://localhost/api/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

function countRows(db: Db, connectionId: string): number {
  return db
    .select()
    .from(dailyCounts)
    .where(eq(dailyCounts.connectionId, connectionId))
    .all().length;
}

describe("POST /api/ingest", () => {
  let db: Db;
  let connectionId: string;

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    resetIngestRateLimiterForTests();
    ({ connectionId } = seedIngestConnection(db));
  });

  it("returns 401 for missing Authorization header", async () => {
    const res = await postIngest([{ date: "2026-07-11", count: 1 }]);
    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid API key", async () => {
    const res = await postIngest(
      [{ date: "2026-07-11", count: 1 }],
      "Bearer csk_invalid",
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for malformed date and writes nothing", async () => {
    const before = countRows(db, connectionId);

    const res = await postIngest(
      [
        { date: "2026-07-11", count: 3 },
        { date: "not-a-date", count: 1 },
      ],
      `Bearer ${API_KEY}`,
    );

    expect(res.status).toBe(400);
    expect(countRows(db, connectionId)).toBe(before);

    const existing = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .all();
    expect(existing.find((r) => r.date === "2026-07-11")).toBeUndefined();
  });

  it("returns 400 for negative count", async () => {
    const before = countRows(db, connectionId);

    const res = await postIngest(
      [{ date: "2026-07-11", count: -1 }],
      `Bearer ${API_KEY}`,
    );

    expect(res.status).toBe(400);
    expect(countRows(db, connectionId)).toBe(before);
  });

  it("returns 400 for more than 5000 rows", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      date: "2026-01-01",
      count: i,
    }));

    const res = await postIngest(rows, `Bearer ${API_KEY}`);
    expect(res.status).toBe(400);
    expect(countRows(db, connectionId)).toBe(1);
  });

  it("upserts rows and replaces existing counts idempotently", async () => {
    const res = await postIngest(
      [
        { date: "2026-07-01", count: 12 },
        { date: "2026-07-11", count: 4 },
      ],
      `Bearer ${API_KEY}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ upserted: 2 });

    const rows = db
      .select()
      .from(dailyCounts)
      .where(eq(dailyCounts.connectionId, connectionId))
      .all();

    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.date === "2026-07-01")?.count).toBe(12);
    expect(rows.find((r) => r.date === "2026-07-11")?.count).toBe(4);
  });

  it("returns 429 when rate limit exceeded", async () => {
    setIngestRateLimiterForTests(createRateLimiter(1, 60_000));

    const first = await postIngest(
      [{ date: "2026-07-11", count: 1 }],
      `Bearer ${API_KEY}`,
    );
    expect(first.status).toBe(200);

    const second = await postIngest(
      [{ date: "2026-07-12", count: 2 }],
      `Bearer ${API_KEY}`,
    );
    expect(second.status).toBe(429);
  });
});
