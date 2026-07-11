import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, type Db } from "@/db/client";
import { users } from "@/db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupTestDb(): Db {
  const db = createDb(":memory:");
  migrate(db, {
    migrationsFolder: path.join(__dirname, "../../../../../drizzle"),
  });
  return db;
}

function seedUser(db: Db, opts: { id: string; isPrivate?: boolean }) {
  db.insert(users)
    .values({
      id: opts.id,
      githubId: "12345",
      handle: "myhandle",
      timezone: "UTC",
      isPrivate: opts.isPrivate ?? false,
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
import { GET, POST } from "./route";

const session = { user: { id: "user-1" } };

async function postPrivacy(
  body: { isPrivate: boolean },
  sessionValue: typeof session | null = session,
) {
  vi.mocked(auth).mockResolvedValue(sessionValue as never);
  return POST(
    new Request("http://localhost/api/settings/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/settings/privacy", () => {
  let db: Db;

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db, { id: "user-1", isPrivate: false });
  });

  it("requires auth (401 if no session)", async () => {
    const res = await postPrivacy({ isPrivate: true }, null);
    expect(res.status).toBe(401);
  });

  it("flips isPrivate to true", async () => {
    const res = await postPrivacy({ isPrivate: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isPrivate: true });

    const user = db.select().from(users).where(eq(users.id, "user-1")).get();
    expect(user?.isPrivate).toBe(true);
  });

  it("flips isPrivate back to false", async () => {
    db.update(users)
      .set({ isPrivate: true })
      .where(eq(users.id, "user-1"))
      .run();

    const res = await postPrivacy({ isPrivate: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isPrivate: false });

    const user = db.select().from(users).where(eq(users.id, "user-1")).get();
    expect(user?.isPrivate).toBe(false);
  });

  it("rejects invalid body", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const res = await POST(
      new Request("http://localhost/api/settings/privacy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrivate: "yes" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/settings/privacy", () => {
  let db: Db;

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db, { id: "user-1", isPrivate: true });
  });

  it("returns current privacy setting", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isPrivate: true });
  });
});
