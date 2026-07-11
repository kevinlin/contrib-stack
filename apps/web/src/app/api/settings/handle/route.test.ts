import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { users } from "@/db/schema";
import { PENDING_HANDLE_PREFIX } from "@/lib/handle";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupTestDb(): Db {
  const db = createDb(":memory:");
  migrate(db, {
    migrationsFolder: path.join(__dirname, "../../../../../drizzle"),
  });
  return db;
}

function seedUser(
  db: Db,
  opts: { id: string; handle: string; githubId?: string },
) {
  db.insert(users)
    .values({
      id: opts.id,
      githubId: opts.githubId ?? "12345",
      handle: opts.handle,
      timezone: "UTC",
      isPrivate: false,
      createdAt: new Date().toISOString(),
    })
    .run();
}

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { POST } from "./route";

async function postHandle(
  body: object,
  session?: { user?: { id: string } } | null,
) {
  vi.mocked(auth).mockResolvedValue(session as never);
  return POST(
    new Request("http://localhost/api/settings/handle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/settings/handle", () => {
  let db: Db;
  const userId = "user-1";

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("requires auth (401 if no session)", async () => {
    const res = await postHandle(
      { handle: "myhandle", timezone: "UTC" },
      null,
    );
    expect(res.status).toBe(401);
  });

  it.each([
    ["MyHandle", "uppercase"],
    ["ab", "too short"],
    ["a".repeat(31), "too long"],
    ["bad_handle", "underscore"],
    ["bad.handle", "dot"],
    ["bad handle", "space"],
  ])("rejects invalid format: %s (%s)", async (handle) => {
    seedUser(db, { id: userId, handle: `${PENDING_HANDLE_PREFIX}${userId}` });
    const res = await postHandle(
      { handle, timezone: "UTC" },
      { user: { id: userId } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects reserved words", async () => {
    seedUser(db, { id: userId, handle: `${PENDING_HANDLE_PREFIX}${userId}` });
    const res = await postHandle(
      { handle: "admin", timezone: "UTC" },
      { user: { id: userId } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects taken handle (409)", async () => {
    seedUser(db, { id: "other-user", handle: "taken", githubId: "99999" });
    seedUser(db, { id: userId, handle: `${PENDING_HANDLE_PREFIX}${userId}` });
    const res = await postHandle(
      { handle: "taken", timezone: "UTC" },
      { user: { id: userId } },
    );
    expect(res.status).toBe(409);
  });

  it("sets handle once (immutable: second call with different handle → 409)", async () => {
    seedUser(db, { id: userId, handle: `${PENDING_HANDLE_PREFIX}${userId}` });
    const first = await postHandle(
      { handle: "myhandle", timezone: "America/New_York" },
      { user: { id: userId } },
    );
    expect(first.status).toBe(200);

    const second = await postHandle(
      { handle: "otherhandle", timezone: "UTC" },
      { user: { id: userId } },
    );
    expect(second.status).toBe(409);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user?.handle).toBe("myhandle");
    expect(user?.timezone).toBe("America/New_York");
  });

  it("claims handle successfully", async () => {
    seedUser(db, { id: userId, handle: `${PENDING_HANDLE_PREFIX}${userId}` });
    const res = await postHandle(
      { handle: "myhandle", timezone: "America/New_York" },
      { user: { id: userId } },
    );
    expect(res.status).toBe(200);

    const user = db.select().from(users).where(eq(users.id, userId)).get();
    expect(user?.handle).toBe("myhandle");
    expect(user?.timezone).toBe("America/New_York");
  });
});
