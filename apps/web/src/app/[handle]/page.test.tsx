import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { connections, dailyCounts, users } from "@/db/schema";
import type { Db } from "@/db/client";
import { ProfileNotFound } from "@/components/ProfileNotFound";
import { resolveProfileView } from "@/lib/profile-page";
import { GET } from "@/app/api/profile/[handle]/route";
import ProfilePage from "./page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function setupTestDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, {
    migrationsFolder: path.join(__dirname, "../../../drizzle"),
  });
  return db;
}

function seedProfileData(db: Db) {
  const createdAt = "2024-01-01T00:00:00.000Z";

  db.insert(users)
    .values({
      id: "user-public",
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
      id: "conn-github",
      userId: "user-public",
      slug: "github-personal",
      type: "github",
      label: "GitHub (personal)",
      color: "#2da44e",
      status: "ok",
      createdAt,
    })
    .run();

  db.insert(dailyCounts)
    .values({ connectionId: "conn-github", date: "2026-01-15", count: 10 })
    .run();
}

vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    ...actual,
    getDb: vi.fn(),
  };
});

vi.mock("@/sync/refresh", () => ({
  refreshIfStale: vi.fn(),
}));

import { getDb } from "@/db/client";

async function renderProfilePage(
  handle: string,
  searchParams: Record<string, string> = {},
) {
  const element = await ProfilePage({
    params: Promise.resolve({ handle }),
    searchParams: Promise.resolve(searchParams),
  });
  return renderToStaticMarkup(element);
}

describe("resolveProfileView", () => {
  it("defaults to rolling year", () => {
    expect(resolveProfileView({})).toEqual({
      widgetRange: "1y",
      apiQuery: "",
      activeTab: "rolling",
    });
  });

  it("passes year param through to widget range and API query", () => {
    expect(resolveProfileView({ year: "2026" })).toEqual({
      widgetRange: "2026",
      apiQuery: "year=2026",
      activeTab: "year",
      activeYear: 2026,
    });
  });

  it("maps range=all to lifetime view", () => {
    expect(resolveProfileView({ range: "all" })).toEqual({
      widgetRange: "all",
      apiQuery: "range=all",
      activeTab: "all",
    });
  });
});

describe("ProfilePage", () => {
  let db: Db;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders identical not-found UI for unknown and private handles", async () => {
    seedProfileData(db);

    const unknownHtml = await renderProfilePage("nobody");
    const privateHtml = await renderProfilePage("privateuser");

    expect(unknownHtml).toBe(privateHtml);
    expect(unknownHtml).toContain("Profile not found");
    expect(unknownHtml).not.toContain("contrib-stack");
  });

  it("passes year param through to widget range attribute", async () => {
    seedProfileData(db);

    const html = await renderProfilePage("kevinlin", { year: "2026" });

    expect(html).toContain('range="2026"');
    expect(html).toContain('user="kevinlin"');
    expect(html).toContain('link="off"');
    expect(html).toContain("/widget.js");
  });

  it("renders year navigation from profile years", async () => {
    seedProfileData(db);

    const html = await renderProfilePage("kevinlin");

    expect(html).toContain("2026");
    expect(html).toContain('href="/kevinlin?year=2026"');
    expect(html).toContain('href="/kevinlin?range=all"');
  });
});

describe("ProfileNotFound", () => {
  it("renders stable not-found markup", () => {
    const html = renderToStaticMarkup(<ProfileNotFound />);
    expect(html).toContain("Profile not found");
    expect(html).toContain("not publicly visible");
  });
});

describe("profile API integration for page fetch", () => {
  let db: Db;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 404 for private profile used by page", async () => {
    seedProfileData(db);
    const res = await GET(
      new Request("http://localhost/api/profile/privateuser"),
      { params: Promise.resolve({ handle: "privateuser" }) },
    );
    expect(res.status).toBe(404);
  });
});
