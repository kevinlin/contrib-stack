import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { connections } from "@/db/schema";
import { PRESET_PALETTE } from "@/lib/colors";
import { makeConnectorFactory, toPublicConnection } from "../route";
import { resync } from "@/sync/refresh";

function getOwnedConnection(db: ReturnType<typeof getDb>, userId: string, id: string) {
  return db
    .select()
    .from(connections)
    .where(and(eq(connections.id, id), eq(connections.userId, userId)))
    .get();
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const updates: { label?: string; color?: string } = {};

  if ("label" in body) {
    if (typeof body.label !== "string" || !body.label.trim()) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    updates.label = body.label;
  }

  if ("color" in body) {
    if (typeof body.color !== "string") {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const normalized = body.color.toLowerCase();
    const allowed = PRESET_PALETTE.some((c) => c.toLowerCase() === normalized);
    if (!allowed) {
      return NextResponse.json({ error: "invalid_color" }, { status: 400 });
    }
    updates.color = body.color;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const db = getDb();
  const existing = getOwnedConnection(db, session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  db.update(connections)
    .set(updates)
    .where(eq(connections.id, id))
    .run();

  const row = db
    .select()
    .from(connections)
    .where(eq(connections.id, id))
    .get()!;

  return NextResponse.json({ connection: toPublicConnection(row) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const existing = getOwnedConnection(db, session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  db.delete(connections).where(eq(connections.id, id)).run();

  return NextResponse.json({ ok: true });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const existing = getOwnedConnection(db, session.user.id, id);
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (existing.type === "ingest") {
    return NextResponse.json({ error: "not_supported" }, { status: 400 });
  }

  const getConnector = makeConnectorFactory(db);
  await resync(db, id, getConnector);

  const row = db
    .select()
    .from(connections)
    .where(eq(connections.id, id))
    .get()!;

  return NextResponse.json({ connection: toPublicConnection(row) });
}
