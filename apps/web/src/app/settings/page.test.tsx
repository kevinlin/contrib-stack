import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { users } from "@/db/schema";
import type { Db } from "@/db/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupTestDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(__dirname, "../../../drizzle"),
  });
  return db;
}

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
}));

import { getDb } from "@/db/client";
import { auth, signOut } from "@/auth";
import SettingsPage from "./page";
import { signOutAction } from "./actions";

describe("SettingsPage server gate", () => {
  let db: Db;

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(auth).mockResolvedValue(null);
    vi.mocked(signOut).mockImplementation(async () => {
      const { redirect } = await import("next/navigation");
      redirect("/");
    });
  });

  it("redirects to sign-in when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    try {
      await SettingsPage();
      expect.fail("should have thrown NEXT_REDIRECT");
    } catch (error: unknown) {
      const err = error as { digest?: string };
      expect(err.digest).toContain("NEXT_REDIRECT");
      expect(err.digest).toContain("/api/auth/signin?callbackUrl=/settings");
    }
  });

  it("redirects pending-handle users to /welcome", async () => {
    db.insert(users)
      .values({
        id: "user-pending",
        githubId: "999",
        handle: "__pending__user-pending",
        timezone: "UTC",
        isPrivate: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      })
      .run();

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-pending" },
      expires: "2027-01-01",
    } as Awaited<ReturnType<typeof auth>>);

    try {
      await SettingsPage();
      expect.fail("should have thrown NEXT_REDIRECT");
    } catch (error: unknown) {
      const err = error as { digest?: string };
      expect(err.digest).toContain("NEXT_REDIRECT");
      expect(err.digest).toContain("/welcome");
    }
  });

  it("renders account bar for claimed user", async () => {
    db.insert(users)
      .values({
        id: "user-claimed",
        githubId: "100",
        handle: "testuser",
        timezone: "UTC",
        isPrivate: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        name: "Test User",
      })
      .run();

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-claimed" },
      expires: "2027-01-01",
    } as Awaited<ReturnType<typeof auth>>);

    const element = await SettingsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("@testuser");
    expect(html).toContain('href="/testuser"');
    expect(html).toContain("View profile");
    expect(html).toContain("Sign out");
  });

  it("signOutAction calls signOut with redirectTo '/'", async () => {
    vi.mocked(signOut).mockResolvedValue(undefined as never);

    await signOutAction();

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
  });
});
