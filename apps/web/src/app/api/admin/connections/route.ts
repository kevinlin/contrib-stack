import {
  ConnectorAuthError,
  githubConnector,
  makeGitlabConnector,
} from "@contrib-stack/connectors";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { connections, users } from "@/db/schema";
import { getDefaultColor } from "@/lib/colors";
import { encryptSecret } from "@/lib/crypto";
import { generateSlug } from "@/lib/slug";
import { startBackfill } from "@/sync/backfill";
import { makeConnectorFactory } from "@/app/api/settings/connections/route";

function authorize(request: Request): boolean {
  const key = process.env.ADMIN_API_KEY;
  if (!key) return false;
  return request.headers.get("authorization") === `Bearer ${key}`;
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request): Promise<Response> {
  if (!authorize(request)) return unauthorized();

  const body = (await request.json()) as {
    handle: string;
    type: "github" | "gitlab";
    label: string;
    token: string;
    baseUrl?: string;
    createdAt?: string;
  };

  const { handle, type, label, token, baseUrl, createdAt } = body;
  const db = getDb();

  const user = db.select().from(users).where(eq(users.handle, handle)).get();
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const creds = { token, ...(baseUrl ? { baseUrl } : {}) };
  try {
    if (type === "github") {
      await githubConnector.validate(creds);
    } else {
      await makeGitlabConnector(user.timezone ?? "UTC").validate(creds);
    }
  } catch (error) {
    const msg =
      error instanceof ConnectorAuthError
        ? error.message
        : error instanceof Error
          ? error.message
          : "validation_failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  const existing = db
    .select()
    .from(connections)
    .where(eq(connections.userId, user.id))
    .all();

  const slug = generateSlug(label, existing.map((c) => c.slug));
  const color = getDefaultColor(
    type,
    existing.filter((c) => c.type === type).map((c) => c.color),
  );

  const id = crypto.randomUUID();

  db.insert(connections)
    .values({
      id,
      userId: user.id,
      slug,
      type,
      label,
      color,
      baseUrl: baseUrl ?? null,
      credentialEncrypted: encryptSecret(token),
      status: "backfilling",
      createdAt: createdAt ?? new Date().toISOString(),
    })
    .run();

  const getConnector = makeConnectorFactory(db);
  startBackfill(db, id, getConnector);

  return NextResponse.json({ id, slug, type, label, color, status: "backfilling" });
}

export async function DELETE(request: Request): Promise<Response> {
  if (!authorize(request)) return unauthorized();

  const { handle, slug } = (await request.json()) as {
    handle: string;
    slug: string;
  };

  const db = getDb();
  const user = db.select().from(users).where(eq(users.handle, handle)).get();
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const conn = db
    .select()
    .from(connections)
    .where(and(eq(connections.userId, user.id), eq(connections.slug, slug)))
    .get();

  if (!conn) {
    return NextResponse.json({ error: "connection_not_found" }, { status: 404 });
  }

  db.delete(connections).where(eq(connections.id, conn.id)).run();
  return NextResponse.json({ deleted: conn.slug });
}
