import { randomBytes } from "node:crypto";
import {
  ConnectorAuthError,
  githubConnector,
  makeGitlabConnector,
} from "@contrib-stack/connectors";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { connections, users } from "@/db/schema";
import { getDefaultColor } from "@/lib/colors";
import { encryptSecret, hashApiKey } from "@/lib/crypto";
import { generateSlug } from "@/lib/slug";
import { startBackfill, type ConnectorFactory } from "@/sync/backfill";

const VALIDATION_TIMEOUT_MS = 5000;

type ConnectionType = "github" | "gitlab" | "ingest";

type ConnectionRow = typeof connections.$inferSelect;

export function toPublicConnection(row: ConnectionRow) {
  return {
    id: row.id,
    userId: row.userId,
    slug: row.slug,
    type: row.type,
    label: row.label,
    color: row.color,
    baseUrl: row.baseUrl,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  };
}

export function makeConnectorFactory(
  db: ReturnType<typeof getDb>,
): ConnectorFactory {
  return (connection) => {
    if (connection.type === "github") {
      return githubConnector;
    }
    if (connection.type === "gitlab") {
      const user = db
        .select({ timezone: users.timezone })
        .from(users)
        .where(eq(users.id, connection.userId))
        .get();
      return makeGitlabConnector(user?.timezone ?? "UTC");
    }
    throw new Error(`No connector for type: ${connection.type}`);
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("validation_timeout")), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function validateGitToken(
  type: "github" | "gitlab",
  token: string,
  baseUrl: string | undefined,
  timezone: string,
): Promise<void> {
  const creds = { token, ...(baseUrl ? { baseUrl } : {}) };

  try {
    if (type === "github") {
      await withTimeout(githubConnector.validate(creds), VALIDATION_TIMEOUT_MS);
    } else {
      const connector = makeGitlabConnector(timezone);
      await withTimeout(connector.validate(creds), VALIDATION_TIMEOUT_MS);
    }
  } catch (error) {
    if (error instanceof ConnectorAuthError) {
      throw error;
    }
    if (error instanceof Error && error.message === "validation_timeout") {
      throw new Error("Token validation timed out");
    }
    throw error;
  }
}

function getUserConnections(db: ReturnType<typeof getDb>, userId: string) {
  return db
    .select()
    .from(connections)
    .where(eq(connections.userId, userId))
    .all();
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const rows = getUserConnections(db, session.user.id);

  return NextResponse.json({
    connections: rows.map(toPublicConnection),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("type" in body) ||
    !("label" in body) ||
    typeof (body as { type: unknown }).type !== "string" ||
    typeof (body as { label: unknown }).label !== "string"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { type, label } = body as {
    type: string;
    label: string;
    baseUrl?: string;
    token?: string;
  };
  const baseUrl =
    "baseUrl" in body && typeof body.baseUrl === "string"
      ? body.baseUrl
      : undefined;
  const token =
    "token" in body && typeof body.token === "string" ? body.token : undefined;

  if (!["github", "gitlab", "ingest"].includes(type)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!label.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = getDb();
  const userId = session.user.id;
  const existing = getUserConnections(db, userId);
  const existingSlugs = existing.map((c) => c.slug);
  const existingColors = existing
    .filter((c) => c.type === type)
    .map((c) => c.color);

  const slug = generateSlug(label, existingSlugs);
  const color = getDefaultColor(type, existingColors);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const connectionType = type as ConnectionType;

  if (connectionType === "ingest") {
    const apiKey = `csk_${randomBytes(32).toString("hex")}`;

    db.insert(connections)
      .values({
        id,
        userId,
        slug,
        type: connectionType,
        label,
        color,
        apiKeyHash: hashApiKey(apiKey),
        status: "ok",
        createdAt,
      })
      .run();

    const row = db
      .select()
      .from(connections)
      .where(eq(connections.id, id))
      .get()!;

    return NextResponse.json({
      connection: toPublicConnection(row),
      apiKey,
    });
  }

  if (!token) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const user = db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  try {
    await validateGitToken(
      connectionType,
      token,
      baseUrl,
      user?.timezone ?? "UTC",
    );
  } catch (error) {
    if (error instanceof ConnectorAuthError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    const message =
      error instanceof Error ? error.message : "Token validation failed";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  db.insert(connections)
    .values({
      id,
      userId,
      slug,
      type: connectionType,
      label,
      color,
      baseUrl: baseUrl ?? null,
      credentialEncrypted: encryptSecret(token),
      status: "backfilling",
      createdAt,
    })
    .run();

  const getConnector = makeConnectorFactory(db);
  startBackfill(db, id, getConnector);

  const row = db
    .select()
    .from(connections)
    .where(eq(connections.id, id))
    .get()!;

  return NextResponse.json({ connection: toPublicConnection(row) });
}
