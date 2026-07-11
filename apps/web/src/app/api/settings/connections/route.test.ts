import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectorAuthError } from "@contrib-stack/connectors";
import { createDb, type Db } from "@/db/client";
import { connections, dailyCounts, users } from "@/db/schema";
import { decryptSecret, hashApiKey } from "@/lib/crypto";
import { generateSlug } from "@/lib/slug";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

function setupTestDb(): Db {
  const db = createDb(":memory:");
  migrate(db, {
    migrationsFolder: path.join(__dirname, "../../../../../drizzle"),
  });
  return db;
}

function seedUser(db: Db, id = "user-1") {
  db.insert(users)
    .values({
      id,
      githubId: "12345",
      handle: "myhandle",
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

const mockGithubValidate = vi.fn();
const mockGitlabValidate = vi.fn();

vi.mock("@contrib-stack/connectors", () => ({
  githubConnector: {
    validate: (...args: unknown[]) => mockGithubValidate(...args),
  },
  makeGitlabConnector: () => ({
    validate: (...args: unknown[]) => mockGitlabValidate(...args),
  }),
  ConnectorAuthError: class ConnectorAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ConnectorAuthError";
    }
  },
}));

vi.mock("@/sync/backfill", () => ({
  startBackfill: vi.fn(),
}));

vi.mock("@/sync/refresh", () => ({
  resync: vi.fn(),
}));

import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { startBackfill } from "@/sync/backfill";
import { resync } from "@/sync/refresh";
import { DELETE, PATCH, POST as POST_BY_ID } from "./[id]/route";
import { GET, POST } from "./route";

const session = { user: { id: "user-1" } };

function mockSession(s: typeof session | null) {
  vi.mocked(auth).mockResolvedValue(s as never);
}

async function createConnection(body: object) {
  mockSession(session);
  return POST(
    new Request("http://localhost/api/settings/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/settings/connections", () => {
  let db: Db;

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db);
    process.env.ENCRYPTION_KEY = TEST_KEY;
    mockGithubValidate.mockReset();
    mockGitlabValidate.mockReset();
    vi.mocked(startBackfill).mockReset();
    mockGithubValidate.mockResolvedValue({
      username: "octocat",
      accountCreatedAt: "2011-01-25T18:44:36Z",
    });
  });

  it("requires auth (401 if no session)", async () => {
    mockSession(null);
    const res = await POST(
      new Request("http://localhost/api/settings/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "github", label: "GH", token: "tok" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("creates git connection with encrypted token (raw token absent from DB)", async () => {
    const res = await createConnection({
      type: "github",
      label: "GitHub (personal)",
      token: "ghp_secret_token",
    });
    expect(res.status).toBe(200);

    const row = db.select().from(connections).get();
    expect(row?.credentialEncrypted).toBeTruthy();
    expect(row?.credentialEncrypted).not.toContain("ghp_secret_token");
    expect(decryptSecret(row!.credentialEncrypted!)).toBe("ghp_secret_token");
    expect(startBackfill).toHaveBeenCalledWith(db, row!.id, expect.any(Function));
  });

  it("returns 422 with connector error for invalid PAT", async () => {
    mockGithubValidate.mockRejectedValue(
      new ConnectorAuthError("Invalid GitHub token"),
    );

    const res = await createConnection({
      type: "github",
      label: "GitHub",
      token: "bad-token",
    });
    expect(res.status).toBe(422);

    const body = await res.json();
    expect(body.error).toBe("Invalid GitHub token");
    expect(db.select().from(connections).get()).toBeUndefined();
  });

  it("creates ingest connection: returns plaintext key once, stores only hash", async () => {
    const res = await createConnection({
      type: "ingest",
      label: "My AI Tool",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.apiKey).toMatch(/^csk_[a-f0-9]{64}$/);
    expect(body.connection.type).toBe("ingest");
    expect(body.connection.apiKeyHash).toBeUndefined();
    expect(body.connection.credentialEncrypted).toBeUndefined();

    const row = db.select().from(connections).get();
    expect(row?.apiKeyHash).toBe(hashApiKey(body.apiKey));
    expect(row?.credentialEncrypted).toBeNull();
  });

  it("second GitHub connection auto-gets distinct shade", async () => {
    const first = await createConnection({
      type: "github",
      label: "GitHub personal",
      token: "ghp_one",
    });
    const firstBody = await first.json();

    mockGithubValidate.mockResolvedValue({
      username: "work",
      accountCreatedAt: "2015-01-01T00:00:00Z",
    });

    const second = await createConnection({
      type: "github",
      label: "GitHub work",
      token: "ghp_two",
    });
    const secondBody = await second.json();

    expect(secondBody.connection.color).not.toBe(firstBody.connection.color);
  });

  it("derives slug from label, unique per user with collision suffixes", async () => {
    const res = await createConnection({
      type: "github",
      label: "GitHub (personal)",
      token: "ghp_one",
    });
    const body = await res.json();
    expect(body.connection.slug).toBe("github-personal");

    mockGithubValidate.mockResolvedValue({
      username: "dup",
      accountCreatedAt: "2015-01-01T00:00:00Z",
    });

    const dup = await createConnection({
      type: "github",
      label: "GitHub (personal)",
      token: "ghp_two",
    });
    const dupBody = await dup.json();
    expect(dupBody.connection.slug).toBe("github-personal-2");
  });
});

describe("generateSlug", () => {
  it("converts labels to kebab-case slugs", () => {
    expect(generateSlug("GitHub (personal)", [])).toBe("github-personal");
    expect(generateSlug("My GitLab", [])).toBe("my-gitlab");
  });

  it("appends -2, -3 on collision", () => {
    expect(generateSlug("github-work", ["github-work"])).toBe("github-work-2");
    expect(
      generateSlug("github-work", ["github-work", "github-work-2"]),
    ).toBe("github-work-3");
  });
});

describe("GET /api/settings/connections", () => {
  let db: Db;

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db);
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it("lists connections without sensitive fields", async () => {
    db.insert(connections)
      .values({
        id: "conn-1",
        userId: "user-1",
        slug: "github-personal",
        type: "github",
        label: "GitHub",
        color: "#2da44e",
        credentialEncrypted: "encrypted:secret",
        apiKeyHash: null,
        status: "ok",
        createdAt: new Date().toISOString(),
      })
      .run();

    mockSession(session);
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]).not.toHaveProperty("credentialEncrypted");
    expect(body.connections[0]).not.toHaveProperty("apiKeyHash");
    expect(body.connections[0].slug).toBe("github-personal");
  });
});

describe("DELETE /api/settings/connections/[id]", () => {
  let db: Db;
  const connectionId = "conn-del";

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db);
    db.insert(connections)
      .values({
        id: connectionId,
        userId: "user-1",
        slug: "github",
        type: "github",
        label: "GitHub",
        color: "#2da44e",
        status: "ok",
        createdAt: new Date().toISOString(),
      })
      .run();
    db.insert(dailyCounts)
      .values({ connectionId, date: "2024-01-01", count: 5 })
      .run();
  });

  it("deletes connection and cascades daily_counts", async () => {
    mockSession(session);
    const res = await DELETE(
      new Request("http://localhost/api/settings/connections/conn-del", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(res.status).toBe(200);

    expect(db.select().from(connections).get()).toBeUndefined();
    expect(
      db
        .select()
        .from(dailyCounts)
        .where(eq(dailyCounts.connectionId, connectionId))
        .all(),
    ).toHaveLength(0);
  });
});

describe("POST /api/settings/connections/[id] (resync)", () => {
  let db: Db;
  const connectionId = "conn-sync";

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db);
    db.insert(connections)
      .values({
        id: connectionId,
        userId: "user-1",
        slug: "github",
        type: "github",
        label: "GitHub",
        color: "#2da44e",
        credentialEncrypted: "enc",
        status: "ok",
        createdAt: new Date().toISOString(),
      })
      .run();
    vi.mocked(resync).mockReset();
  });

  it("triggers resync for owned connection", async () => {
    mockSession(session);
    const res = await POST_BY_ID(
      new Request("http://localhost/api/settings/connections/conn-sync", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(res.status).toBe(200);
    expect(resync).toHaveBeenCalledWith(db, connectionId, expect.any(Function));
  });
});

describe("PATCH /api/settings/connections/[id]", () => {
  let db: Db;
  const connectionId = "conn-patch";

  beforeEach(() => {
    db = setupTestDb();
    vi.mocked(getDb).mockReturnValue(db);
    seedUser(db);
    db.insert(connections)
      .values({
        id: connectionId,
        userId: "user-1",
        slug: "github",
        type: "github",
        label: "GitHub",
        color: "#2da44e",
        status: "ok",
        createdAt: new Date().toISOString(),
      })
      .run();
  });

  it("updates label and color", async () => {
    mockSession(session);
    const res = await PATCH(
      new Request("http://localhost/api/settings/connections/conn-patch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Work GitHub", color: "#1f883d" }),
      }),
      { params: Promise.resolve({ id: connectionId }) },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.connection.label).toBe("Work GitHub");
    expect(body.connection.color).toBe("#1f883d");
  });
});
