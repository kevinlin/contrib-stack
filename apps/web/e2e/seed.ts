import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../src/db/schema";
import { connections, dailyCounts, sessions, users } from "../src/db/schema";
import { hashApiKey } from "../src/lib/crypto";

const WEB_ROOT = path.join(__dirname, "..");

export const E2E_DIR = path.join(WEB_ROOT, ".e2e");
export const DB_PATH = path.join(E2E_DIR, "test.db");
export const FIXTURES_PATH = path.join(E2E_DIR, "fixtures.json");

export const E2E_ENV = {
  DATABASE_PATH: DB_PATH,
  ENCRYPTION_KEY: "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQ==",
  AUTH_SECRET: "test-auth-secret-for-e2e-tests",
  AUTH_GITHUB_ID: "test",
  AUTH_GITHUB_SECRET: "test",
} as const;

export const API_KEY = "csk_testkey123456789012345678901234";

export type E2EFixtures = {
  sessionToken: string;
  pendingSessionToken: string;
  apiKey: string;
  handle: string;
  demoHandle: string;
  connectionSlugs: {
    github: string;
    gitlab: string;
    ingest: string;
  };
};

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function generateDateRange(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

function runMigration(sqlite: Database.Database): void {
  const migrationSql = readFileSync(
    path.join(WEB_ROOT, "drizzle/0000_organic_deathstrike.sql"),
    "utf8",
  ).replace(/--> statement-breakpoint\n/g, "");
  sqlite.exec(migrationSql);
}

function seedUserProfile(
  db: ReturnType<typeof drizzle>,
  opts: {
    userId: string;
    handle: string;
    githubId: string;
    githubConnId: string;
    gitlabConnId: string;
    ingestConnId: string;
    createdAt: string;
    syncedAt: string;
    includeYearNavData?: boolean;
  },
): void {
  const {
    userId,
    handle,
    githubId,
    githubConnId,
    gitlabConnId,
    ingestConnId,
    createdAt,
    syncedAt,
    includeYearNavData = false,
  } = opts;

  db.insert(users)
    .values({
      id: userId,
      githubId,
      handle,
      timezone: "UTC",
      isPrivate: false,
      createdAt,
      name: handle,
    })
    .run();

  db.insert(connections)
    .values([
      {
        id: githubConnId,
        userId,
        slug: "github-personal",
        type: "github",
        label: "GitHub",
        color: "#2da44e",
        status: "ok",
        lastSyncedAt: syncedAt,
        createdAt,
      },
      {
        id: gitlabConnId,
        userId,
        slug: "gitlab-work",
        type: "gitlab",
        label: "GitLab",
        color: "#fc6d26",
        status: "ok",
        lastSyncedAt: syncedAt,
        createdAt,
      },
      {
        id: ingestConnId,
        userId,
        slug: "my-ingest",
        type: "ingest",
        label: "Ingest",
        color: "#ff6b00",
        apiKeyHash: userId === "e2e-user-testuser" ? hashApiKey(API_KEY) : null,
        status: "ok",
        createdAt,
      },
    ])
    .run();

  const recentDates = generateDateRange("2026-06-12", 30);
  const githubCounts = recentDates.map((date, i) => ({
    connectionId: githubConnId,
    date,
    count: (i % 5) + 1,
  }));
  const gitlabCounts = recentDates.map((date, i) => ({
    connectionId: gitlabConnId,
    date,
    count: (i % 3) + 2,
  }));
  db.insert(dailyCounts).values(githubCounts).run();
  db.insert(dailyCounts).values(gitlabCounts).run();

  if (includeYearNavData) {
    db.insert(dailyCounts)
      .values([
        { connectionId: githubConnId, date: "2025-03-15", count: 50 },
        { connectionId: gitlabConnId, date: "2025-03-15", count: 25 },
        { connectionId: ingestConnId, date: "2025-08-01", count: 7 },
      ])
      .run();
  } else {
    db.insert(dailyCounts)
      .values([{ connectionId: ingestConnId, date: "2025-08-01", count: 7 }])
      .run();
  }
}

export function seedDatabase(): E2EFixtures {
  if (existsSync(E2E_DIR)) {
    rmSync(E2E_DIR, { recursive: true, force: true });
  }
  mkdirSync(E2E_DIR, { recursive: true });

  const sqlite = new Database(DB_PATH);
  runMigration(sqlite);
  const db = drizzle(sqlite, { schema });

  const createdAt = "2026-01-01T00:00:00.000Z";
  const syncedAt = "2026-07-11T12:00:00.000Z";
  const userId = "e2e-user-testuser";
  const demoUserId = "e2e-user-demo";
  const pendingUserId = "e2e-user-pending";
  const sessionToken = "e2e-session-token-testuser";
  const pendingSessionToken = "e2e-session-token-pending";

  seedUserProfile(db, {
    userId,
    handle: "testuser",
    githubId: "10001",
    githubConnId: "e2e-conn-github",
    gitlabConnId: "e2e-conn-gitlab",
    ingestConnId: "e2e-conn-ingest",
    createdAt,
    syncedAt,
    includeYearNavData: true,
  });

  seedUserProfile(db, {
    userId: demoUserId,
    handle: "demo",
    githubId: "10002",
    githubConnId: "e2e-demo-conn-github",
    gitlabConnId: "e2e-demo-conn-gitlab",
    ingestConnId: "e2e-demo-conn-ingest",
    createdAt,
    syncedAt,
  });

  db.insert(users)
    .values({
      id: pendingUserId,
      githubId: "10003",
      handle: "__pending__" + pendingUserId,
      timezone: "UTC",
      isPrivate: false,
      createdAt,
    })
    .run();

  const expires = new Date("2027-01-01T00:00:00.000Z");
  db.insert(sessions)
    .values([
      { sessionToken, userId, expires },
      { sessionToken: pendingSessionToken, userId: pendingUserId, expires },
    ])
    .run();

  sqlite.close();

  const fixtures: E2EFixtures = {
    sessionToken,
    pendingSessionToken,
    apiKey: API_KEY,
    handle: "testuser",
    demoHandle: "demo",
    connectionSlugs: {
      github: "github-personal",
      gitlab: "gitlab-work",
      ingest: "my-ingest",
    },
  };

  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  return fixtures;
}

export function loadFixtures(): E2EFixtures {
  return JSON.parse(readFileSync(FIXTURES_PATH, "utf8")) as E2EFixtures;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const monorepoRoot = path.join(WEB_ROOT, "../..");
  execSync("pnpm --filter widget build", {
    cwd: monorepoRoot,
    stdio: "inherit",
  });

  const widgetSrc = path.join(monorepoRoot, "packages/widget/dist/widget.js");
  const widgetDest = path.join(WEB_ROOT, "public/widget.js");
  if (!existsSync(widgetSrc)) {
    throw new Error(`Widget bundle missing at ${widgetSrc}`);
  }
  copyFileSync(widgetSrc, widgetDest);

  seedDatabase();
}
