import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isPendingHandle, validateHandle } from "@/lib/handle";

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
    !("handle" in body) ||
    !("timezone" in body) ||
    typeof (body as { handle: unknown }).handle !== "string" ||
    typeof (body as { timezone: unknown }).timezone !== "string"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { handle, timezone } = body as { handle: string; timezone: string };

  const validation = validateHandle(handle);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.reason }, { status: 400 });
  }

  const db = getDb();
  const user = db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .get();

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  if (!isPendingHandle(user.handle)) {
    return NextResponse.json({ error: "handle_immutable" }, { status: 409 });
  }

  const taken = db.select().from(users).where(eq(users.handle, handle)).get();
  if (taken) {
    return NextResponse.json({ error: "handle_taken" }, { status: 409 });
  }

  db.update(users)
    .set({ handle, timezone })
    .where(eq(users.id, session.user.id))
    .run();

  return NextResponse.json({ handle, timezone });
}
