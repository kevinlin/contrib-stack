import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { connections, dailyCounts, users } from "@/db/schema";
import type { Db } from "@/db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupTestDb(): Db {
  const sqlite = new Database(":memory:");
  const migrationSql = readFileSync(
    path.join(__dirname, "../../../../../drizzle/0000_organic_deathstrike.sql"),
    "utf8",
  ).replace(/--> statement-breakpoint\n/g, "");
  sqlite.exec(migrationSql);
  return drizzle(sqlite, { schema });
}

function seedProfileData(db: Db) {
  const userId = "user-public";
  const conn1Id = "conn-github";
  const conn2Id = "conn-ingest";
  const createdAt = "2024-01-01T00:00:00.000Z";

  db.insert(users)
    .values({
      id: userId,
      githubId: "111",
      handle: "kevinlin",
      timezone: "UTC",
      isPrivate: false,
      createdAt,
    })
    .run();

  db.insert(users)
    .values({
      id: "user-private",
      githubId: "222",
      handle: "privateuser",
      timezone: "UTC",
      isPrivate: true,
      createdAt,
    })
    .run();

  db.insert(connections)
    .values({
      id: conn1Id,
      userId,
      slug: "github-personal",
      type: "github",
      label: "GitHub (personal)",
      color: "#2da44e",
      status: "ok",
      createdAt,
    })
    .run();

  db.insert(connections)
    .values({
      id: conn2Id,
      userId,
      slug: "custom-ingest",
      type: "ingest",
      label: "Custom",
      color: "#ff6b00",
      status: "ok",
      createdAt,
    })
    .run();

  const counts = [
    { connectionId: conn1Id, date: "2025-06-01", count: 3 },
    { connectionId: conn1Id, date: "2025-08-01", count: 4 },
    { connectionId: conn1Id, date: "2026-01-15", count: 10 },
    { connectionId: conn1Id, date: "2026-07-11", count: 5 },
    { connectionId: conn2Id, date: "2026-07-10", count: 2 },
    { connectionId: conn2Id, date: "2024-03-01", count: 7 },
  ];

  for (const row of counts) {
    db.insert(dailyCounts).values(row).run();
  }

  return { userId, conn1Id, conn2Id };
}

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

const refreshIfStale = vi.fn();
vi.mock("@/sync/refresh", () => ({
  refreshIfStale: (...args: unknown[]) => refreshIfStale(...args),
}));

import { getDb } from "@/db/client";
import { GET } from "./route";

async function getProfile(
  handle: string,
  query = "",
): Promise<Response> {
  const url = `http://localhost/api/profile/${handle}${query ? `?${query}` : ""}`;
  return GET(new Request(url), {
    params: Promise.resolve({ handle }),
  });
}

describe("GET /api/profile/:handle", () => {
  let db: Db;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    refreshIfStale.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 for unknown handle", async () => {
    const res = await getProfile("nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("returns identical 404 for private profile as unknown handle", async () => {
    seedProfileData(db);

    const unknown = await getProfile("nobody");
    const privateRes = await getProfile("privateuser");

    expect(privateRes.status).toBe(404);

    const unknownBody = await unknown.json();
    const privateBody = await privateRes.json();
    expect(privateBody).toEqual({ error: "not_found" });
    expect(privateBody).toEqual(unknownBody);

    const unknownHeaders = [...unknown.headers.entries()].sort();
    const privateHeaders = [...privateRes.headers.entries()].sort();
    expect(privateHeaders).toEqual(unknownHeaders);
  });

  it("filters days by year query param", async () => {
    seedProfileData(db);

    const res = await getProfile("kevinlin", "year=2026");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.handle).toBe("kevinlin");
    expect(body.years).toEqual([2026, 2025, 2024]);

    const github = body.connections.find(
      (c: { slug: string }) => c.slug === "github-personal",
    );
    expect(github.days.map((d: { date: string }) => d.date)).toEqual([
      "2026-01-15",
      "2026-07-11",
    ]);
    expect(github.total).toBe(22);
  });

  it("returns lifetime days with range=all", async () => {
    seedProfileData(db);

    const res = await getProfile("kevinlin", "range=all");
    expect(res.status).toBe(200);

    const body = await res.json();
    const github = body.connections.find(
      (c: { slug: string }) => c.slug === "github-personal",
    );
    expect(github.days.map((d: { date: string }) => d.date)).toEqual([
      "2025-06-01",
      "2025-08-01",
      "2026-01-15",
      "2026-07-11",
    ]);

    const ingest = body.connections.find(
      (c: { slug: string }) => c.slug === "custom-ingest",
    );
    expect(ingest.days.map((d: { date: string }) => d.date)).toEqual([
      "2024-03-01",
      "2026-07-10",
    ]);
  });

  it("includes Access-Control-Allow-Origin: * header", async () => {
    seedProfileData(db);

    const res = await getProfile("kevinlin");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("triggers refreshIfStale for each connection without awaiting", async () => {
    const { conn1Id, conn2Id } = seedProfileData(db);

    await getProfile("kevinlin");

    expect(refreshIfStale).toHaveBeenCalledTimes(2);
    expect(refreshIfStale).toHaveBeenCalledWith(
      db,
      conn1Id,
      expect.any(Function),
    );
    expect(refreshIfStale).toHaveBeenCalledWith(
      db,
      conn2Id,
      expect.any(Function),
    );
  });

  it("defaults to rolling 365 days when no year or range param", async () => {
    seedProfileData(db);

    const res = await getProfile("kevinlin");
    const body = await res.json();

    const github = body.connections.find(
      (c: { slug: string }) => c.slug === "github-personal",
    );
    expect(github.days.map((d: { date: string }) => d.date)).toEqual([
      "2025-08-01",
      "2026-01-15",
      "2026-07-11",
    ]);
  });

  it("excludes years older than 10 years from the years list", async () => {
    seedProfileData(db);
    db.insert(dailyCounts)
      .values({ connectionId: "conn-github", date: "2015-05-01", count: 5 })
      .run();

    const res = await getProfile("kevinlin", "range=all");
    const body = await res.json();

    expect(body.years).toEqual([2026, 2025, 2024]);
    const github = body.connections.find(
      (c: { slug: string }) => c.slug === "github-personal",
    );
    expect(github.days.map((d: { date: string }) => d.date)).toContain(
      "2015-05-01",
    );
  });

  it("excludes zero-count-only years from the years list", async () => {
    seedProfileData(db);
    db.insert(dailyCounts)
      .values({ connectionId: "conn-github", date: "2023-03-01", count: 0 })
      .run();

    const res = await getProfile("kevinlin", "year=2026");
    const body = await res.json();

    expect(body.years).not.toContain(2023);
    expect(body.years).toEqual([2026, 2025, 2024]);
  });
});
