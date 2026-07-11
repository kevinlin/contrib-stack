import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const user = db
    .select({ isPrivate: users.isPrivate })
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ isPrivate: user.isPrivate });
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
    !("isPrivate" in body) ||
    typeof (body as { isPrivate: unknown }).isPrivate !== "boolean"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { isPrivate } = body as { isPrivate: boolean };
  const db = getDb();

  db.update(users)
    .set({ isPrivate })
    .where(eq(users.id, session.user.id))
    .run();

  return NextResponse.json({ isPrivate });
}
